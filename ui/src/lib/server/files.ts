/** Shared / system-layer path constants. Per-profile paths live in
 *  profile-paths.ts (profilePath(id, kind) / activePath(kind)). This
 *  module holds only paths shared across all profiles: ROOT (repo
 *  root), ENV_FILE (.env shared infra), MODES_DIR (modes/ templates). */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const MODES_DIR = path.join(ROOT, 'modes');
export const ENV_FILE = path.join(ROOT, '.env');

/** Per-user / per-profile data root. Single source of truth for every
 *  filesystem path under `data/` (profiles, users, sources.json, etc.).
 *
 *  Resolution: explicit `HERON_DATA_DIR` env override -> repo-relative
 *  `<ROOT>/data` fallback. The override lets E2E tests (Playwright
 *  globalSetup + webServer env) point the dashboard at a tmpdir seed
 *  AND keeps screenshot-mode + CI sandboxes isolated from the
 *  developer's real data/. The DB module (`db/index.ts`) reads the
 *  same env var so SQLite + FS land in the same parent dir. */
export const DATA_ROOT = process.env.HERON_DATA_DIR
  ? path.resolve(process.env.HERON_DATA_DIR)
  : path.join(ROOT, 'data');

export function readSafe(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** modes/ contents -- system layer, shared, NOT per-profile. */
export function listModes(): string[] {
  try {
    return fs.readdirSync(MODES_DIR).filter((f: string) => f.endsWith('.md'));
  } catch {
    return [];
  }
}
