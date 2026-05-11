/**
 * Backup + restore module.
 *
 * What's backed up (scope = "user data only"):
 *   data/profiles/                — every profile dir (cv.md, profile.yml,
 *                                   _profile.md, portals.yml, applications.md,
 *                                   pipeline.md, scan-history.tsv,
 *                                   gemini-scores.tsv, follow-ups.md,
 *                                   reports/, output/, interview-prep/)
 *   data/profiles.json            — active-profile pointer + profile list
 *   data/sources.json             — scanner config (across profiles)
 *   data/autopilot.json           — schedule + thresholds
 *   data/issues.jsonl             — open issues (Inbox)
 *   data/activity.jsonl           — activity feed (small + useful)
 *   data/onboarding-state.json    — onboarding progress
 *   interview-prep/story-bank.md  — shared STAR+R bank
 *
 * What's NOT backed up:
 *   .env                          — credentials (deliberate; scope (a))
 *   node_modules/                 — re-installable
 *   .playwright-*                 — browser sessions (re-login)
 *   .git/                         — version control
 *   data/backups/                 — recursion guard
 *   data/apply-state/             — transient runtime state
 *   ui/build/, ui/.svelte-kit/    — build artifacts
 *
 * Storage layout:
 *   data/backups/{ISO}.tar.gz     — gzipped tarball, ISO timestamp filename
 *   data/backups/{ISO}.meta.json  — sidecar with file count + profile slugs
 *
 * Format: gzipped tar, paths relative to ROOT. tar binary used (bsdtar
 * on macOS, GNU tar on Linux — both accept -czf / -xzf). Trade-off:
 * losing Windows compatibility, but career-ops is Unix-first anyway.
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

const BACKUPS_DIR = path.join(ROOT, 'data', 'backups');

// What goes INTO a backup. Relative to ROOT. Resolved at backup time —
// missing entries are skipped silently (fresh installs may not have
// all files yet).
const INCLUDE_PATHS = [
  'data/profiles',
  'data/profiles.json',
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
  'ui/build',
  'ui/.svelte-kit',
];

// Default retention in days — the autopilot card lets the user tune this.
export const DEFAULT_RETENTION_DAYS = 14;

export type BackupInfo = {
  id: string;            // ISO timestamp, also the filename stem
  path: string;          // absolute path to the .tar.gz
  metaPath: string;      // absolute path to the .meta.json sidecar
  size: number;          // bytes
  createdAt: number;     // ms epoch
  fileCount?: number;    // from sidecar, undefined if missing
  profiles?: string[];   // slugs included, undefined if sidecar missing
  app?: string;          // app version (e.g. content of VERSION), undefined if missing
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

const CONFIG_PATH = path.join(BACKUPS_DIR, 'config.json');

/** Read the backup config. Falls back to defaults when missing/corrupt. */
export function readBackupConfig(): BackupConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { retentionDays: DEFAULT_RETENTION_DAYS };
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    const days = typeof parsed.retentionDays === 'number' && parsed.retentionDays > 0
      ? parsed.retentionDays
      : DEFAULT_RETENTION_DAYS;
    return { retentionDays: days };
  } catch {
    return { retentionDays: DEFAULT_RETENTION_DAYS };
  }
}

export function writeBackupConfig(next: BackupConfig): BackupConfig {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const clean: BackupConfig = {
    retentionDays: Math.max(1, Math.min(365, Math.round(next.retentionDays))),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(clean, null, 2) + '\n');
  return clean;
}

/** Slugify a Date into an ISO-ish filename-safe string.
 *  Output shape: 2026-05-11T13-45-22Z. The "Z" preserves UTC intent,
 *  the dashes-where-colons-would-be keep it filesystem-friendly. */
function timestampId(d: Date = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
}

/** List which profile slugs the backup is going to capture. Used by the
 *  metadata sidecar so the restore confirmation can show "these 2 profiles
 *  will be overwritten" before the destructive action. */
function listProfileSlugs(): string[] {
  const dir = path.join(ROOT, 'data', 'profiles');
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Count files that will actually go into the tarball. Used for the
 *  sidecar and the UI's "23 files · 1.2 MB" badge. */
function countIncludedFiles(): number {
  let count = 0;
  const visit = (rel: string) => {
    const abs = path.join(ROOT, rel);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); } catch { return; }
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
      } catch { /* permission etc */ }
    }
  };
  for (const p of INCLUDE_PATHS) visit(p);
  return count;
}

/** Write the sidecar metadata for a freshly-created tarball. */
function writeSidecar(metaPath: string, payload: {
  fileCount: number;
  profiles: string[];
  app?: string;
}): void {
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2) + '\n');
}

function readVersion(): string | undefined {
  try {
    return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  } catch {
    return undefined;
  }
}

/** Create a new tarball under data/backups/. Returns the result + prunes
 *  anything older than retentionDays once the new one is on disk.
 *  Logs to the activity feed. */
export async function createBackup(): Promise<CreateBackupResult> {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const id = timestampId();
  const tarPath = path.join(BACKUPS_DIR, id + '.tar.gz');
  const metaPath = path.join(BACKUPS_DIR, id + '.meta.json');

  // Gather what we're including. Skip anything that's not on disk yet —
  // a fresh install may not have data/issues.jsonl yet.
  const presentTargets = INCLUDE_PATHS.filter((p) =>
    fs.existsSync(path.join(ROOT, p)),
  );
  if (presentTargets.length === 0) {
    return { ok: false, error: 'No data files to back up' };
  }

  const args: string[] = ['-czf', tarPath];
  for (const pat of EXCLUDE_PATTERNS) args.push('--exclude=' + pat);
  args.push('-C', ROOT, ...presentTargets);

  const profiles = listProfileSlugs();
  const fileCount = countIncludedFiles();
  const startedAt = Date.now();

  return new Promise<CreateBackupResult>((resolve) => {
    const child = spawn('tar', args, { cwd: ROOT });
    let stderr = '';
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => {
      reportServerError('backup', 'tar spawn failed', err, { category: 'system' });
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        // Clean up the half-written tarball.
        try { fs.unlinkSync(tarPath); } catch {}
        const msg = stderr.split('\n').slice(0, 3).join(' | ') || ('tar exit ' + code);
        logEvent('backup', 'Backup failed', {
          level: 'error',
          category: 'system',
          message: msg,
        });
        resolve({ ok: false, error: msg });
        return;
      }
      let size = 0;
      try { size = fs.statSync(tarPath).size; } catch {}
      writeSidecar(metaPath, { fileCount, profiles, app: readVersion() });

      // Prune old backups.
      const pruned = pruneOldBackups();

      const durationS = ((Date.now() - startedAt) / 1000).toFixed(1);
      logEvent('backup', 'Backup created · ' + id, {
        level: 'success',
        category: 'system',
        message: `${fileCount} files · ${(size / 1024 / 1024).toFixed(1)} MB · ${durationS}s` +
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
    if (!fs.existsSync(BACKUPS_DIR)) return [];
  } catch { return []; }
  const out: BackupInfo[] = [];
  let entries: string[] = [];
  try { entries = fs.readdirSync(BACKUPS_DIR); } catch { return []; }
  for (const name of entries) {
    if (!name.endsWith('.tar.gz')) continue;
    const id = name.slice(0, -'.tar.gz'.length);
    const tarPath = path.join(BACKUPS_DIR, name);
    const metaPath = path.join(BACKUPS_DIR, id + '.meta.json');
    let size = 0;
    let createdAt = Date.now();
    try {
      const st = fs.statSync(tarPath);
      size = st.size;
      createdAt = st.mtimeMs;
    } catch { continue; }
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
    } catch { /* sidecar missing or corrupt — still surface the tarball */ }
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
  try { fs.unlinkSync(info.path); } catch { return false; }
  try { if (fs.existsSync(info.metaPath)) fs.unlinkSync(info.metaPath); } catch {}
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
export function verifyBackupIntegrity(id: string): { ok: boolean; entries?: number; error?: string } {
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
      error: 'Cannot restore while tasks are running: ' + running.join(', ') +
        '. Wait for them to finish, then retry.',
    };
  }

  // Integrity check before destroying anything.
  const integrity = verifyBackupIntegrity(id);
  if (!integrity.ok) {
    return { ok: false, error: 'Backup integrity check failed: ' + (integrity.error || 'unknown') };
  }

  const stage = path.join(BACKUPS_DIR, '.restore-' + id);
  const audit = path.join(BACKUPS_DIR, '.pre-restore-' + id);

  // Clean any stale staging dir from a previous failed attempt.
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(audit, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(stage, { recursive: true });

  // Extract into the staging dir.
  const extract = spawnSync('tar', ['-xzf', info.path, '-C', stage], { encoding: 'utf8' });
  if (extract.status !== 0) {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    return { ok: false, error: 'tar -xzf failed: ' + (extract.stderr || '').slice(0, 200) };
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
      try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(audit, { recursive: true, force: true }); } catch {}
      return { ok: false, error: 'Audit snapshot failed: ' + (e instanceof Error ? e.message : String(e)) };
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
      } catch {}
      try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
      return {
        ok: false,
        error: 'Restore failed at ' + rel + ': ' + (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  // Clean up staging (audit dir stays as the undo trail).
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}

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
  try { stat = fs.statSync(p); } catch { return 0; }
  if (stat.isFile()) return 1;
  if (stat.isDirectory()) {
    try {
      for (const entry of fs.readdirSync(p)) n += countFilesAt(path.join(p, entry));
    } catch {}
  }
  return n;
}

/** Just for the verifier — exported so verify-backup.mjs can probe it. */
export function _internal_includePaths(): readonly string[] {
  return INCLUDE_PATHS;
}
export function _internal_excludePatterns(): readonly string[] {
  return EXCLUDE_PATTERNS;
}
