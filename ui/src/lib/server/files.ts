/**
 * Path constants for the flat legacy single-profile layout.
 *
 * Multi-profile layout (data/profiles/{slug}/...) is being rolled out
 * incrementally. Modules that have been updated to accept `profileId`
 * (see profile.ts, portals.ts) call `profilePath()` directly and should
 * NOT import from this file. Modules that haven't been migrated yet
 * keep using these constants, which continue to point at the original
 * flat paths.
 *
 * Once Phase 1 of the multi-profile rollout is complete (every reader
 * threads profileId through), these constants will be removed entirely
 * and migration will be turned on at boot. Until then, migration MUST
 * stay off — moving files out from under these constants would break
 * the dashboard.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const PIPELINE = path.join(ROOT, 'data', 'pipeline.md');
export const APPLICATIONS = path.join(ROOT, 'data', 'applications.md');
export const GEMINI_SCORES = path.join(ROOT, 'data', 'gemini-scores.tsv');
export const REPORTS_DIR = path.join(ROOT, 'reports');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const PROFILE_YML = path.join(ROOT, 'config', 'profile.yml');
export const MODES_DIR = path.join(ROOT, 'modes');
export const CV_MD = path.join(ROOT, 'cv.md');
export const ENV_FILE = path.join(ROOT, '.env');

export function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

export function listReports(): string[] {
  try { return fs.readdirSync(REPORTS_DIR).filter((f: string) => f.endsWith('.md')).sort(); }
  catch { return []; }
}

export function readReport(filename: string): string {
  return readSafe(path.join(REPORTS_DIR, filename));
}

export function listPdfs(): string[] {
  try { return fs.readdirSync(OUTPUT_DIR).filter((f: string) => f.endsWith('.pdf')); }
  catch { return []; }
}

export function listModes(): string[] {
  try { return fs.readdirSync(MODES_DIR).filter((f: string) => f.endsWith('.md')); }
  catch { return []; }
}
