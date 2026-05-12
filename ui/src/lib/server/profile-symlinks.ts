/**
 * profile-symlinks — keep the repo-root flat-layout paths pointing at the
 * active profile's files via symlinks.
 *
 * Why this exists: the dashboard's TS server modules go through
 * profile-paths.ts and resolve `data/users/{userId}/profiles/{slug}/...`
 * directly. But the Claude Code CLI (spawned by runOferta) reads the
 * system files at their canonical legacy paths per the AGENTS.md /
 * modes/oferta.md instructions:
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
 * MULTI-USER CAVEAT — these symlinks are GLOBAL. The repo only has one
 * `cv.md` symlink, so concurrent CLI spawns for different users would race
 * the swap. Until the CLI integration is reworked to pass paths via env
 * variables, multi-user oferta is SERIALIZED through the named lock at
 * `data/.symlink-lock`. Background jobs that don't depend on the legacy
 * symlinks (everything in TS that uses profilePath()) keep their per-user
 * isolation regardless.
 *
 * Atomicity: each swap unlinks + recreates the symlink under the lock.
 *
 * If the target legacy path is a REAL FILE (not a symlink), we DO NOT
 * touch it — the user may have run the migration partially or restored a
 * .bak. Safer to log a warning and skip than to clobber real data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { profilePathForUser, type ProfileFileKind } from './profile-paths';
import { currentUserIdOrDefault } from './user-context';
import { logEvent } from './events';

const LOCK_FILE = path.join(ROOT, 'data', '.symlink-lock');
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_MS = 50;

function acquireLock(): void {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
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
  kind: ProfileFileKind;
};

const TARGETS: LegacyTarget[] = [
  { legacyPath: path.join(ROOT, 'cv.md'), kind: 'cv-md' },
  { legacyPath: path.join(ROOT, 'config', 'profile.yml'), kind: 'profile-yml' },
  { legacyPath: path.join(ROOT, 'portals.yml'), kind: 'portals-yml' },
  { legacyPath: path.join(ROOT, 'modes', '_profile.md'), kind: 'profile-md' },
];

/**
 * Point every legacy path at the named profile's corresponding file via
 * a symlink. The acting user is resolved from the AsyncLocalStorage
 * context unless overridden via `swapProfileSymlinksForUser`.
 */
export function swapProfileSymlinks(profileId: string): void {
  swapProfileSymlinksForUser(currentUserIdOrDefault(), profileId);
}

/** Like `swapProfileSymlinks` but takes an explicit userId — used by
 *  background jobs (autopilot tick, batch workers) that may need to
 *  prepare the symlinks for a different user than the request actor. */
export function swapProfileSymlinksForUser(userId: string, profileId: string): void {
  acquireLock();
  try {
    swapInner(userId, profileId);
  } finally {
    releaseLock();
  }
}

function swapInner(userId: string, profileId: string): void {
  for (const t of TARGETS) {
    const dst = profilePathForUser(userId, profileId, t.kind);
    try {
      fs.mkdirSync(path.dirname(t.legacyPath), { recursive: true });

      let stat: fs.Stats | null = null;
      try {
        stat = fs.lstatSync(t.legacyPath);
      } catch {
        stat = null;
      }

      if (stat) {
        if (stat.isSymbolicLink()) {
          const current = fs.readlinkSync(t.legacyPath);
          // resolve symlink target relative to its directory so we can
          // compare against the absolute `dst`.
          const currentAbs = path.resolve(path.dirname(t.legacyPath), current);
          if (currentAbs === dst) continue; // already correct
          fs.unlinkSync(t.legacyPath);
        } else {
          logEvent('profile-symlinks', 'Legacy path is a real file — skipping symlink', {
            level: 'warn',
            category: 'system',
            message:
              t.legacyPath +
              ' (expected a symlink). Move the file into data/users/{userId}/profiles/{slug}/ and re-run migration.',
          });
          continue;
        }
      }
      // Relative symlink so a repo move doesn't break it.
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
