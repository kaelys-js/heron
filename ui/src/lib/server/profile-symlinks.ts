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
 * Atomicity: each swap unlinks + recreates the symlink. If concurrent
 * oferta calls for different profiles overlap, the later swap wins — which
 * is OK because we only support one runOferta concurrently anyway (the
 * `running` map gate enforces that).
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

type LegacyTarget = {
  legacyPath: string;
  kind: Parameters<typeof profilePath>[1];
};

const TARGETS: LegacyTarget[] = [
  { legacyPath: path.join(ROOT, 'cv.md'),                 kind: 'cv-md' },
  { legacyPath: path.join(ROOT, 'config', 'profile.yml'), kind: 'profile-yml' },
  { legacyPath: path.join(ROOT, 'portals.yml'),           kind: 'portals-yml' },
  { legacyPath: path.join(ROOT, 'modes', '_profile.md'),  kind: 'profile-md' },
];

/**
 * Point every legacy path at the named profile's corresponding file via
 * a symlink. Idempotent: if the symlink already points at the right
 * target, no-op. If the legacy path is a real file (not a symlink), skip
 * it and warn — we don't want to silently clobber the user's data.
 */
export function swapProfileSymlinks(profileId: string): void {
  for (const t of TARGETS) {
    const dst = profilePath(profileId, t.kind);
    try {
      // Make sure the directory exists for the legacy path (e.g. config/ for profile.yml).
      fs.mkdirSync(path.dirname(t.legacyPath), { recursive: true });

      // Inspect the existing legacy path. lstat so we don't follow the
      // symlink we may have created earlier.
      let stat: fs.Stats | null = null;
      try { stat = fs.lstatSync(t.legacyPath); } catch { stat = null; }

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
            message: t.legacyPath + ' (expected a symlink). Move the file into data/profiles/{slug}/ and re-run migration.',
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
