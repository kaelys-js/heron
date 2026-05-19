/** Shared / system-layer path constants. Per-profile paths live in
 *  profile-paths.ts (profilePath(id, kind) / activePath(kind)). This
 *  module holds only paths shared across all profiles: ROOT (repo
 *  root), ENV_FILE (.env shared infra), MODES_DIR (modes/ templates). */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const MODES_DIR = path.join(ROOT, 'modes');
export const ENV_FILE = path.join(ROOT, '.env');

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
