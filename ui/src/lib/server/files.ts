/**
 * Shared / system-layer path constants.
 *
 * Per-profile paths live in `profile-paths.ts` (`profilePath(id, kind)` or
 * the active-profile shortcut `activePath(kind)`). This module is now ONLY
 * for paths that are genuinely shared across all profiles (system layer):
 *
 *   ROOT       — repository root
 *   ENV_FILE   — .env (shared API keys + IMAP creds)
 *   MODES_DIR  — modes/ (system-layer mode templates; never per-profile)
 *
 * Anything that used to live here as a flat-layout per-profile constant
 * (PIPELINE, APPLICATIONS, CV_MD, etc.) has moved to `profile-paths.ts`.
 */
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

/** modes/ contents — system layer, shared, NOT per-profile. */
export function listModes(): string[] {
  try {
    return fs.readdirSync(MODES_DIR).filter((f: string) => f.endsWith('.md'));
  } catch {
    return [];
  }
}
