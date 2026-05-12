/**
 * profile-symlinks — keep the repo-root flat-layout paths pointing at the
 * active profile's files via symlinks.
 *
 * Why this exists: the dashboard's TS server modules go through
 * profile-paths.ts and resolve `data/profiles/{id}/...` directly. But the
 * Claude Code CLI (spawned by runOferta) reads the system files at their
 * canonical legacy paths per the AGENTS.md / modes/oferta.md instructions:
 *
 *   cv.md
 *   config/profile.yml
 *   portals.yml
 *   modes/_profile.md
 *
 * Until those instructions are rewritten to be profile-aware (out-of-scope
 * for the current refactor), we maintain symlinks at the legacy paths that
 * point at the ACTIVE profile's actual files. When the user switches
 * profiles or before a per-profile oferta spawn, we re-point the symlinks.
 *
 * Atomicity (F7): each swap unlinks + recreates the symlink. Concurrent
 * spawns for different profiles can race the swap, so this module uses a
 * named file-system lock at `data/.symlink-lock` to serialize swaps
 * across the process. The `running` map gates one oferta at a time, but
 * runOferta + runAutoEval use different task keys ('oferta' vs 'auto-eval')
 * AND runBulkOfertaParallel spawns multiple workers in parallel — without
 * the lock those paths can swap symlinks while another claude -p worker is
 * mid-read.
 *
 * If the target legacy path is a REAL FILE (not a symlink), we DO NOT
 * touch it — the user may have run the migration partially or restored a
 * .bak. Safer to log a warning and skip than to clobber real data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { profilePath } from './profile-paths';
import { logEvent } from './events';

/** Lock file path. Created via O_EXCL flag so two concurrent acquireLock
 *  calls produce exactly one winner. */
const LOCK_FILE = path.join(ROOT, 'data', '.symlink-lock');
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_MS = 50;

/** Acquire a process-local advisory lock. Spin-waits up to LOCK_TIMEOUT_MS
 *  for a stale lock to age out. Returns once we hold it; throws on timeout. */
function acquireLock(): void {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // O_CREAT|O_EXCL|O_WRONLY — atomically create-or-fail.
      const fd = fs.openSync(
        LOCK_FILE,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      );
      fs.writeSync(fd, String(process.pid) + '@' + Date.now());
      fs.closeSync(fd);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw e;
      // Stale-lock detection — if the lock file is older than the timeout,
      // assume the previous holder crashed and reclaim it.
      try {
        const stat = fs.statSync(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
          fs.unlinkSync(LOCK_FILE);
          continue;
        }
      } catch {
        /* file gone — loop and retry */
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error('symlink-swap lock timeout after ' + LOCK_TIMEOUT_MS + 'ms');
      }
      // Sync sleep — this whole function is called sync from spawn sites.
      const deadline = Date.now() + LOCK_POLL_MS;
      while (Date.now() < deadline) {
        /* spin */
      }
    }
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    /* already gone */
  }
}

type LegacyTarget = {
  legacyPath: string;
  kind: Parameters<typeof profilePath>[1];
};

const TARGETS: LegacyTarget[] = [
  { legacyPath: path.join(ROOT, 'cv.md'), kind: 'cv-md' },
  { legacyPath: path.join(ROOT, 'config', 'profile.yml'), kind: 'profile-yml' },
  { legacyPath: path.join(ROOT, 'portals.yml'), kind: 'portals-yml' },
  { legacyPath: path.join(ROOT, 'modes', '_profile.md'), kind: 'profile-md' },
];

/**
 * Point every legacy path at the named profile's corresponding file via
 * a symlink. Idempotent: if the symlink already points at the right
 * target, no-op. If the legacy path is a real file (not a symlink), skip
 * it and warn — we don't want to silently clobber the user's data.
 */
export function swapProfileSymlinks(profileId: string): void {
  acquireLock();
  try {
    swapInner(profileId);
  } finally {
    releaseLock();
  }
}

function swapInner(profileId: string): void {
  for (const t of TARGETS) {
    const dst = profilePath(profileId, t.kind);
    try {
      // Make sure the directory exists for the legacy path (e.g. config/ for profile.yml).
      fs.mkdirSync(path.dirname(t.legacyPath), { recursive: true });

      // Inspect the existing legacy path. lstat so we don't follow the
      // symlink we may have created earlier.
      let stat: fs.Stats | null = null;
      try {
        stat = fs.lstatSync(t.legacyPath);
      } catch {
        stat = null;
      }

      if (stat) {
        if (stat.isSymbolicLink()) {
          const current = fs.readlinkSync(t.legacyPath);
          if (current === dst) continue; // already correct
          fs.unlinkSync(t.legacyPath);
        } else {
          // Real file or directory at the legacy path — don't touch it.
          logEvent('profile-symlinks', 'Legacy path is a real file — skipping symlink', {
            level: 'warn',
            category: 'system',
            message:
              t.legacyPath +
              ' (expected a symlink). Move the file into data/profiles/{slug}/ and re-run migration.',
          });
          continue;
        }
      }
      // Create the symlink. Use a relative path so a repo move doesn't break it.
      const rel = path.relative(path.dirname(t.legacyPath), dst);
      fs.symlinkSync(rel, t.legacyPath);
    } catch (e) {
      logEvent('profile-symlinks', 'Symlink swap failed', {
        level: 'warn',
        category: 'system',
        message: t.legacyPath + ': ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
}
