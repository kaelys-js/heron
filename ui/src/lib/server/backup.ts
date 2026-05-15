/**
 * Backup + restore module.
 *
 * Multi-user: backups now capture EVERY user's data tree (not just the
 * legacy `data/profiles/`) plus both SQLite files. The owner is the only
 * person who can trigger a backup, and a restore overwrites everything.
 *
 * What's backed up:
 *   data/users/                   — every user's content tree:
 *                                   data/users/{userId}/profiles/{slug}/{cv.md,
 *                                   profile.yml, _profile.md, portals.yml,
 *                                   applications.md, pipeline.md,
 *                                   scan-history.tsv, gemini-scores.tsv,
 *                                   follow-ups.md, reports/, output/,
 *                                   interview-prep/}
 *   data/users/.legacy-claimed    — which user inherited legacy single-user data
 *   data/profiles/                — legacy single-user content (still
 *                                   populated until full DB migration lands;
 *                                   captured for safety)
 *   data/profiles.json            — legacy active-profile pointer
 *   data/auth.db                  — every user + session + passkey
 *   data/app.db                   — every per-user app row
 *   data/sources.json             — scanner config (install-wide)
 *   data/autopilot.json           — schedule + thresholds (install-wide)
 *   data/issues.jsonl             — open issues (per-user filtered at read time)
 *   data/activity.jsonl           — activity feed (per-user filtered)
 *   data/onboarding-state.json    — onboarding progress (install-wide)
 *   interview-prep/story-bank.md  — shared STAR+R bank (install-wide)
 *
 * What's NOT backed up:
 *   .env                          — credentials (deliberate; scope (a))
 *   node_modules/                 — re-installable
 *   .playwright-*                 — browser sessions (re-login)
 *   .git/                         — version control
 *   data/backups/                 — recursion guard
 *   data/apply-state/             — transient runtime state
 *   data/*.db-{wal,shm,journal}   — SQLite runtime journals
 *   ui/build/, ui/.svelte-kit/    — build artifacts
 *
 * Storage layout:
 *   data/backups/{ISO}.tar.gz     — gzipped tarball, ISO timestamp filename
 *   data/backups/{ISO}.meta.json  — sidecar with file count + profile slugs
 *
 * Format: gzipped tar, paths relative to ROOT. tar binary used (bsdtar
 * on macOS, GNU tar on Linux — both accept -czf / -xzf). Trade-off:
 * losing Windows compatibility, but Heron is Unix-first anyway.
 *
 * Retention: configurable N days (default 14). On every successful
 * backup, prune anything older than N days from data/backups/.
 *
 * Safety:
 *   - Restore refuses to run while any orchestrator task is in flight
 *     (a half-restored applications.md is much worse than no restore).
 *   - Tarball integrity verified with `tar -tzf` before extraction.
 *   - Extraction lands in a temp dir, then renames in over the existing
 *     paths atomically (well — as atomic as fs.rename across dirs gets).
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { ROOT } from './files';
import { logEvent, reportServerError } from './events';
import { listRunning } from './orchestrator';
import { userSharedPath } from './profile-paths';

/** Per-user backup dir. Each user's tarballs live in their own
 *  _shared/backups/ — Alice's archives don't end up in Bob's view +
 *  a per-user reset doesn't nuke other users' history. */
function backupsDir(): string {
  return userSharedPath('backups-dir');
}

// What goes INTO a backup. Relative to ROOT. Resolved at backup time —
// missing entries are skipped silently (fresh installs may not have
// all files yet).
const INCLUDE_PATHS = [
  // Multi-user trees (new layout).
  'data/users',
  'data/auth.db',
  'data/app.db',
  // Legacy single-user layout (preserved until full DB migration lands so
  // pre-multi-user installs can still be backed up & restored).
  'data/profiles',
  'data/profiles.json',
  // Install-wide shared infra.
  'data/sources.json',
  'data/autopilot.json',
  'data/issues.jsonl',
  'data/activity.jsonl',
  'data/onboarding-state.json',
  'interview-prep/story-bank.md',
] as const;

// Exclude patterns passed to tar. tar accepts --exclude='pattern' relative
// to the source tree. We exclude transient + sensitive + recursive stuff.
const EXCLUDE_PATTERNS = [
  '.env',
  'node_modules',
  '.playwright-*',
  '.git',
  'data/backups',
  'data/apply-state',
  // SQLite runtime journals — restoring these without the main db file
  // is catastrophic. The db file itself IS included; the wal/shm get
  // recreated on next open.
  '*.db-wal',
  '*.db-shm',
  '*.db-journal',
  'ui/build',
  'ui/.svelte-kit',
];

// Default retention in days — the autopilot card lets the user tune this.
export const DEFAULT_RETENTION_DAYS = 14;

export type BackupInfo = {
  id: string; // ISO timestamp, also the filename stem
  path: string; // absolute path to the .tar.gz
  metaPath: string; // absolute path to the .meta.json sidecar
  size: number; // bytes
  createdAt: number; // ms epoch
  fileCount?: number; // from sidecar, undefined if missing
  profiles?: string[]; // slugs included, undefined if sidecar missing
  app?: string; // app version (e.g. content of VERSION), undefined if missing
};

export type CreateBackupResult = {
  ok: boolean;
  id?: string;
  path?: string;
  size?: number;
  fileCount?: number;
  profiles?: string[];
  pruned?: number;
  error?: string;
};

export type RestoreBackupResult = {
  ok: boolean;
  id?: string;
  restoredFiles?: number;
  error?: string;
};

export type BackupConfig = {
  retentionDays: number;
};

function configPath(): string {
  return path.join(backupsDir(), 'config.json');
}

/** Read the backup config. Falls back to defaults when missing/corrupt. */
export function readBackupConfig(): BackupConfig {
  try {
    if (!fs.existsSync(configPath())) return { retentionDays: DEFAULT_RETENTION_DAYS };
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    const days =
      typeof parsed.retentionDays === 'number' && parsed.retentionDays > 0
        ? parsed.retentionDays
        : DEFAULT_RETENTION_DAYS;
    return { retentionDays: days };
  } catch (e) {
    // Config corrupted but recoverable — fall back to defaults but surface
    // the corruption so the user knows their retention preference isn't
    // being honored.
    reportServerError('backup', 'Backup config corrupt — using defaults', e, {
      category: 'system',
    });
    return { retentionDays: DEFAULT_RETENTION_DAYS };
  }
}

export function writeBackupConfig(next: BackupConfig): BackupConfig {
  fs.mkdirSync(backupsDir(), { recursive: true });
  const clean: BackupConfig = {
    retentionDays: Math.max(1, Math.min(365, Math.round(next.retentionDays))),
  };
  fs.writeFileSync(configPath(), JSON.stringify(clean, null, 2) + '\n');
  return clean;
}

/** Slugify a Date into an ISO-ish filename-safe string.
 *  Output shape: 2026-05-11T13-45-22Z. The "Z" preserves UTC intent,
 *  the dashes-where-colons-would-be keep it filesystem-friendly. */
function timestampId(d: Date = new Date()): string {
  return d
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/-\d{3}Z$/, 'Z');
}

/** Inventory of what the backup is going to capture. Used by the
 *  metadata sidecar so the restore confirmation can show "these 3 users
 *  with 5 profiles will be overwritten" before the destructive action. */
function listBackupInventory(): { users: string[]; legacyProfiles: string[] } {
  const users: string[] = [];
  const legacyProfiles: string[] = [];
  // Multi-user: data/users/{userId}/profiles/{slug}/...
  const usersRoot = path.join(ROOT, 'data', 'users');
  try {
    if (fs.existsSync(usersRoot)) {
      for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        users.push(entry.name);
      }
    }
  } catch (e) {
    // readdir failure on a dir we just confirmed exists means EACCES or
    // EIO — backup will succeed with empty inventory which is misleading.
    reportServerError('backup', 'Could not enumerate users dir for inventory', e, {
      category: 'system',
    });
  }
  // Legacy single-user: data/profiles/{slug}/...
  const legacyRoot = path.join(ROOT, 'data', 'profiles');
  try {
    if (fs.existsSync(legacyRoot)) {
      for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) legacyProfiles.push(entry.name);
      }
    }
  } catch (e) {
    reportServerError('backup', 'Could not enumerate legacy profiles dir for inventory', e, {
      category: 'system',
    });
  }
  return { users: users.sort(), legacyProfiles: legacyProfiles.sort() };
}

/** Count files that will actually go into the tarball. Used for the
 *  sidecar and the UI's "23 files · 1.2 MB" badge. */
function countIncludedFiles(): number {
  let count = 0;
  const visit = (rel: string) => {
    const abs = path.join(ROOT, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return;
    }
    if (stat.isFile()) {
      count++;
      return;
    }
    if (stat.isDirectory()) {
      // Skip excluded dirs.
      const relParts = rel.split('/');
      for (const pat of EXCLUDE_PATTERNS) {
        if (relParts.some((p) => p === pat) || rel === pat) return;
      }
      try {
        for (const entry of fs.readdirSync(abs)) {
          visit(rel + '/' + entry);
        }
      } catch {
        /* permission etc */
      }
    }
  };
  for (const p of INCLUDE_PATHS) visit(p);
  return count;
}

/** Write the sidecar metadata for a freshly-created tarball. */
function writeSidecar(
  metaPath: string,
  payload: {
    fileCount: number;
    profiles: string[];
    /** New: every user id captured in the tarball. */
    users?: string[];
    /** New: schema versions of the captured SQLite DBs, used by the
     *  restore UI to warn if it's restoring an older snapshot than the
     *  current install schema. */
    schemaVersions?: { auth?: number; app?: number };
    app?: string;
  },
): void {
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2) + '\n');
}

function readVersion(): string | undefined {
  try {
    return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  } catch {
    return undefined;
  }
}

/** Snapshot the on-disk schema_version rows from both SQLite DBs. We use
 *  the singleton handles from db/index.ts which are already open under
 *  WAL mode — the read is sub-millisecond and doesn't block writers. */
function readSchemaVersions(): { auth?: number; app?: number } {
  const out: { auth?: number; app?: number } = {};
  try {
    // Local import so this module doesn't pull the SQLite singleton at
    // load time (some test paths spin up backup.ts before db/ is ready).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require('./db') as typeof import('./db');
    const handles: Array<['auth' | 'app', typeof dbMod.authSqliteHandle]> = [
      ['auth', dbMod.authSqliteHandle],
      ['app', dbMod.appSqliteHandle],
    ];
    for (const [key, handle] of handles) {
      try {
        const row = handle.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
          | { value?: string }
          | undefined;
        if (row?.value) out[key] = parseInt(row.value, 10);
      } catch {
        /* tables may not exist yet on a fresh install — non-fatal */
      }
    }
  } catch {
    /* db module not loadable in this context — non-fatal */
  }
  return out;
}

/** Create a new tarball under data/backups/. Returns the result + prunes
 *  anything older than retentionDays once the new one is on disk.
 *  Logs to the activity feed. */
export async function createBackup(): Promise<CreateBackupResult> {
  fs.mkdirSync(backupsDir(), { recursive: true });
  const id = timestampId();
  const tarPath = path.join(backupsDir(), id + '.tar.gz');
  const metaPath = path.join(backupsDir(), id + '.meta.json');

  // Gather what we're including. Skip anything that's not on disk yet —
  // a fresh install may not have data/issues.jsonl yet.
  const presentTargets = INCLUDE_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p)));
  if (presentTargets.length === 0) {
    return { ok: false, error: 'No data files to back up' };
  }

  const args: string[] = ['-czf', tarPath];
  for (const pat of EXCLUDE_PATTERNS) args.push('--exclude=' + pat);
  args.push('-C', ROOT, ...presentTargets);

  const inventory = listBackupInventory();
  const profiles = [...inventory.legacyProfiles]; // sidecar back-compat field
  const fileCount = countIncludedFiles();
  const startedAt = Date.now();

  return new Promise<CreateBackupResult>((resolve) => {
    const child = spawn('tar', args, { cwd: ROOT });
    let stderr = '';
    child.stderr.on('data', (b) => {
      stderr += b.toString();
    });
    child.on('error', (err) => {
      reportServerError('backup', 'tar spawn failed', err, { category: 'system' });
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        // Clean up the half-written tarball.
        try {
          fs.unlinkSync(tarPath);
        } catch (cleanupErr) {
          // Failed-tarball debris on disk is non-fatal but worth surfacing
          // so the user knows their backups dir may have orphan files.
          logEvent('backup', 'Could not clean up half-written tarball', {
            level: 'warn',
            category: 'system',
            message:
              tarPath +
              ': ' +
              (cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)),
          });
        }
        const msg = stderr.split('\n').slice(0, 3).join(' | ') || 'tar exit ' + code;
        logEvent('backup', 'Backup failed', {
          level: 'error',
          category: 'system',
          message: msg,
        });
        resolve({ ok: false, error: msg });
        return;
      }
      let size = 0;
      try {
        size = fs.statSync(tarPath).size;
      } catch (e) {
        // We just produced this file; stat failing here means something
        // racy happened (another process unlinked it?). Surface it.
        logEvent('backup', 'Tarball stat failed after successful tar exit', {
          level: 'warn',
          category: 'system',
          message: tarPath + ': ' + (e instanceof Error ? e.message : String(e)),
        });
      }
      writeSidecar(metaPath, {
        fileCount,
        profiles,
        users: inventory.users,
        schemaVersions: readSchemaVersions(),
        app: readVersion(),
      });

      // Prune old backups.
      const pruned = pruneOldBackups();

      const durationS = ((Date.now() - startedAt) / 1000).toFixed(1);
      logEvent('backup', 'Backup created · ' + id, {
        level: 'success',
        category: 'system',
        message:
          `${fileCount} files · ${(size / 1024 / 1024).toFixed(1)} MB · ${durationS}s` +
          (pruned > 0 ? ` · pruned ${pruned}` : ''),
      });
      resolve({ ok: true, id, path: tarPath, size, fileCount, profiles, pruned });
    });
  });
}

/** Return every backup currently on disk, newest first. Reads filename
 *  + fs.stat + sidecar (when present). */
export function listBackups(): BackupInfo[] {
  try {
    if (!fs.existsSync(backupsDir())) return [];
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(backupsDir());
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!name.endsWith('.tar.gz')) continue;
    const id = name.slice(0, -'.tar.gz'.length);
    const tarPath = path.join(backupsDir(), name);
    const metaPath = path.join(backupsDir(), id + '.meta.json');
    let size = 0;
    let createdAt = Date.now();
    try {
      const st = fs.statSync(tarPath);
      size = st.size;
      createdAt = st.mtimeMs;
    } catch {
      continue;
    }
    const info: BackupInfo = { id, path: tarPath, metaPath, size, createdAt };
    try {
      if (fs.existsSync(metaPath)) {
        const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
          fileCount?: number;
          profiles?: string[];
          app?: string;
        };
        info.fileCount = parsed.fileCount;
        info.profiles = parsed.profiles;
        info.app = parsed.app;
      }
    } catch (e) {
      // Sidecar corrupt — we still surface the tarball so the user can
      // restore from it (tarball integrity is checked at restore time),
      // but flag the broken sidecar so they know the metadata is stale.
      logEvent('backup', 'Backup sidecar unreadable · ' + id, {
        level: 'warn',
        category: 'system',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    out.push(info);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

/** Find a specific backup by id (the filename stem). */
export function getBackup(id: string): BackupInfo | null {
  // Defense in depth: refuse path-traversal candidates.
  if (!/^[\w.\-:T]+Z?$/.test(id)) return null;
  return listBackups().find((b) => b.id === id) ?? null;
}

/** Delete a single backup + its sidecar. Returns true on success. */
export function deleteBackup(id: string): boolean {
  const info = getBackup(id);
  if (!info) return false;
  try {
    fs.unlinkSync(info.path);
  } catch (e) {
    reportServerError('backup', 'Backup delete failed · ' + id, e, { category: 'system' });
    return false;
  }
  try {
    if (fs.existsSync(info.metaPath)) fs.unlinkSync(info.metaPath);
  } catch (e) {
    // Orphan sidecar — the tarball is gone but we couldn't drop the
    // metadata. listBackups() will skip it (no .tar.gz to pair with) but
    // the user will see leftover .meta.json files in the dir.
    logEvent('backup', 'Backup sidecar unlink failed · ' + id, {
      level: 'warn',
      category: 'system',
      message: e instanceof Error ? e.message : String(e),
    });
  }
  logEvent('backup', 'Backup deleted · ' + id, { level: 'info', category: 'system' });
  return true;
}

/** Drop any backup older than `retentionDays`. Returns the count pruned.
 *  The most recent backup is ALWAYS kept regardless of age — safety net
 *  in case the retention setting was just dropped to 1 day and yesterday's
 *  backup is the only one we have. */
export function pruneOldBackups(): number {
  const { retentionDays } = readBackupConfig();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const all = listBackups(); // newest first
  if (all.length <= 1) return 0;
  let pruned = 0;
  // Skip index 0 (newest) so we always keep ≥1 backup.
  for (let i = 1; i < all.length; i++) {
    const b = all[i];
    if (b.createdAt < cutoff) {
      if (deleteBackup(b.id)) pruned++;
    }
  }
  return pruned;
}

/** Validate that a tarball is well-formed gzip + tar. Cheap to do — we
 *  list its contents without extracting. Returns true on valid. */
export function verifyBackupIntegrity(id: string): {
  ok: boolean;
  entries?: number;
  error?: string;
} {
  const info = getBackup(id);
  if (!info) return { ok: false, error: 'not-found' };
  const r = spawnSync('tar', ['-tzf', info.path], { encoding: 'utf8' });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || '').slice(0, 200) };
  }
  const entries = (r.stdout || '').split('\n').filter(Boolean).length;
  return { ok: true, entries };
}

/** Restore a backup, OVERWRITING the current data/profiles + shared infra
 *  files. Refuses to run while any orchestrator task is active — a half-
 *  restored applications.md is much worse than no restore.
 *
 *  Strategy:
 *   1. Verify tarball integrity (tar -tzf).
 *   2. Extract into data/backups/.restore-{id}/ (temp staging area).
 *   3. Move existing dirs to data/backups/.pre-restore-{id}/ (audit trail).
 *   4. Rename staging → real paths.
 *   5. Log success + return count.
 *
 *  We DON'T delete the .pre-restore-{id}/ folder afterwards — it's the
 *  "are you sure" undo button. The next prune will sweep it after the
 *  retention window. */
export async function restoreBackup(id: string): Promise<RestoreBackupResult> {
  const info = getBackup(id);
  if (!info) return { ok: false, error: 'Backup not found: ' + id };

  // Safety gate: refuse if any task is running.
  const running = listRunning();
  if (running.length > 0) {
    return {
      ok: false,
      error:
        'Cannot restore while tasks are running: ' +
        running.join(', ') +
        '. Wait for them to finish, then retry.',
    };
  }

  // Integrity check before destroying anything.
  const integrity = verifyBackupIntegrity(id);
  if (!integrity.ok) {
    return { ok: false, error: 'Backup integrity check failed: ' + (integrity.error || 'unknown') };
  }

  const stage = path.join(backupsDir(), '.restore-' + id);
  const audit = path.join(backupsDir(), '.pre-restore-' + id);

  // Clean any stale staging dir from a previous failed attempt. force:true
  // already swallows ENOENT, so this catch only fires on real EACCES/EIO —
  // worth surfacing since it'll cause the subsequent mkdir to fail too.
  try {
    fs.rmSync(stage, { recursive: true, force: true });
  } catch (e) {
    logEvent('backup', 'Could not clean stale staging dir', {
      level: 'warn',
      category: 'system',
      message: stage + ': ' + (e instanceof Error ? e.message : String(e)),
    });
  }
  try {
    fs.rmSync(audit, { recursive: true, force: true });
  } catch (e) {
    logEvent('backup', 'Could not clean stale audit dir', {
      level: 'warn',
      category: 'system',
      message: audit + ': ' + (e instanceof Error ? e.message : String(e)),
    });
  }
  fs.mkdirSync(stage, { recursive: true });

  // Extract into the staging dir.
  const extract = spawnSync('tar', ['-xzf', info.path, '-C', stage], { encoding: 'utf8' });
  if (extract.status !== 0) {
    try {
      fs.rmSync(stage, { recursive: true, force: true });
    } catch (e) {
      logEvent('backup', 'Could not clean staging dir after extract failure', {
        level: 'warn',
        category: 'system',
        message: stage + ': ' + (e instanceof Error ? e.message : String(e)),
      });
    }
    const tarErr = 'tar -xzf failed: ' + (extract.stderr || '').slice(0, 200);
    logEvent('backup', 'Restore extract failed · ' + id, {
      level: 'error',
      category: 'system',
      message: tarErr,
    });
    return { ok: false, error: tarErr };
  }

  // Snapshot the live versions of each include-path into the audit dir
  // BEFORE we overwrite. Lets the user undo even if the new restore is
  // also broken.
  fs.mkdirSync(audit, { recursive: true });
  for (const rel of INCLUDE_PATHS) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(audit, rel);
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.cpSync(src, dst, { recursive: true });
    } catch (e) {
      // Audit copy failed — bail BEFORE touching live data.
      reportServerError('backup', 'Audit snapshot failed during restore · ' + id, e, {
        category: 'system',
      });
      try {
        fs.rmSync(stage, { recursive: true, force: true });
      } catch (cleanupErr) {
        logEvent('backup', 'Could not clean staging dir after audit failure', {
          level: 'warn',
          category: 'system',
          message:
            stage + ': ' + (cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)),
        });
      }
      try {
        fs.rmSync(audit, { recursive: true, force: true });
      } catch (cleanupErr) {
        logEvent('backup', 'Could not clean audit dir after audit failure', {
          level: 'warn',
          category: 'system',
          message:
            audit + ': ' + (cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)),
        });
      }
      return {
        ok: false,
        error: 'Audit snapshot failed: ' + (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  // Now overwrite live with staged. For each include-path, delete the
  // current dir/file and copy from staging.
  let restoredFiles = 0;
  for (const rel of INCLUDE_PATHS) {
    const stagedSrc = path.join(stage, rel);
    const liveDst = path.join(ROOT, rel);
    if (!fs.existsSync(stagedSrc)) continue;
    try {
      // Remove current.
      if (fs.existsSync(liveDst)) {
        fs.rmSync(liveDst, { recursive: true, force: true });
      }
      // Copy from staging.
      fs.mkdirSync(path.dirname(liveDst), { recursive: true });
      fs.cpSync(stagedSrc, liveDst, { recursive: true });
      // Count files brought across.
      restoredFiles += countFilesAt(liveDst);
    } catch (e) {
      // Mid-restore failure — try to roll back from the audit dir.
      reportServerError('backup', 'Restore failed mid-flight; rolling back from audit', e, {
        category: 'system',
      });
      // Best-effort rollback.
      try {
        const auditSrc = path.join(audit, rel);
        if (fs.existsSync(auditSrc)) {
          fs.rmSync(liveDst, { recursive: true, force: true });
          fs.cpSync(auditSrc, liveDst, { recursive: true });
        }
      } catch (rollbackErr) {
        // Rollback failed — user is in a half-restored state. This is the
        // worst possible outcome; surface it as an error event so they
        // know to inspect data/backups/.pre-restore-{id}/ manually.
        reportServerError(
          'backup',
          'Rollback from audit failed at ' + rel + ' · MANUAL RECOVERY NEEDED',
          rollbackErr,
          { category: 'system' },
        );
      }
      try {
        fs.rmSync(stage, { recursive: true, force: true });
      } catch (cleanupErr) {
        logEvent('backup', 'Could not clean staging dir after rollback', {
          level: 'warn',
          category: 'system',
          message:
            stage + ': ' + (cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)),
        });
      }
      return {
        ok: false,
        error: 'Restore failed at ' + rel + ': ' + (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  // Clean up staging (audit dir stays as the undo trail).
  try {
    fs.rmSync(stage, { recursive: true, force: true });
  } catch (e) {
    // Successful restore but couldn't clean the staging dir — non-fatal
    // (next restore will rm -rf it first), just surfaced for visibility.
    logEvent('backup', 'Could not clean staging dir after successful restore', {
      level: 'warn',
      category: 'system',
      message: stage + ': ' + (e instanceof Error ? e.message : String(e)),
    });
  }

  logEvent('backup', 'Restored from ' + id, {
    level: 'success',
    category: 'system',
    message: `${restoredFiles} files · audit at .pre-restore-${id}/`,
  });
  return { ok: true, id, restoredFiles };
}

function countFilesAt(p: string): number {
  let n = 0;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(p);
  } catch {
    return 0;
  }
  if (stat.isFile()) return 1;
  if (stat.isDirectory()) {
    try {
      for (const entry of fs.readdirSync(p)) n += countFilesAt(path.join(p, entry));
    } catch {
      // readdir failure on a stat-confirmed dir is EACCES/EIO — we just
      // skip the subtree so file count is slightly under-reported.
    }
  }
  return n;
}

/** Exposed so backup.integration.test.ts can probe the include set. */
export function _internal_includePaths(): readonly string[] {
  return INCLUDE_PATHS;
}
export function _internal_excludePatterns(): readonly string[] {
  return EXCLUDE_PATTERNS;
}
