import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const PIPELINE = path.join(ROOT, 'data', 'pipeline.md');
export const APPLICATIONS = path.join(ROOT, 'data', 'applications.md');
export const GEMINI_SCORES = path.join(ROOT, 'data', 'gemini-scores.tsv');
export const REPORTS_DIR = path.join(ROOT, 'reports');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const PROFILE_YML = path.join(ROOT, 'config', 'profile.yml');

export function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

export function listReports(): string[] {
  try { return fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.md')).sort(); }
  catch { return []; }
}

export function readReport(filename: string): string {
  return readSafe(path.join(REPORTS_DIR, filename));
}

export function listPdfs(): string[] {
  try { return fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.pdf')); }
  catch { return []; }
}
