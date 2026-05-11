/**
 * cover-letter-style — collect user-edited cover letters as style refs.
 *
 * The cover-letter generator produces a different tone every run because
 * Claude has no prior context on YOUR voice. After a few cover letters
 * the user has either accepted as-is or edited, we have signal — feed
 * the 3 most-recent ones back as style references on subsequent runs.
 *
 * Heuristic: a cover letter is considered "user-approved style" if the
 * user has either:
 *   (a) Marked the job as Applied/Interview/Offer (signal: it went out)
 *   (b) Manually edited the .md file (mtime > generator's stdout-write time
 *       on the report — proxied by comparing file mtime to report mtime)
 *
 * Pure-function. The generator endpoint reads styleSamples() and includes
 * the bodies in its Claude prompt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { loadAllJobs } from './parsers';
import { profilePath } from './profile-paths';

export type StyleSample = {
  jobId: string;
  company: string;
  role: string;
  body: string;
  ts: number;
  /** What signal we used to consider this style-quality. */
  source: 'applied' | 'edited' | 'high-status';
};

/** Find user-approved cover letters in the output dir for this profile. */
export function styleSamples(profileId: string, limit = 3): StyleSample[] {
  const out: StyleSample[] = [];
  let outDir: string;
  try { outDir = profilePath(profileId, 'output-dir'); }
  catch { return out; }
  if (!fs.existsSync(outDir)) return out;
  let entries: string[];
  try { entries = fs.readdirSync(outDir); }
  catch { return out; }

  // Cover letters live as {n}-{slug}-{date}-cover.md
  const coverFiles = entries.filter((f) => /-cover\.md$/.test(f));
  if (coverFiles.length === 0) return out;

  const jobs = loadAllJobs(profileId);
  // Index jobs by their PDF filename → easier to correlate with cover letter.
  const jobByCover = new Map<string, typeof jobs[number]>();
  for (const j of jobs) {
    if (!j.pdfFile) continue;
    const stem = path.basename(j.pdfFile).replace(/\.pdf$/, '');
    const expectedCover = stem + '-cover.md';
    jobByCover.set(expectedCover, j);
  }

  for (const f of coverFiles) {
    const full = path.join(outDir, f);
    const job = jobByCover.get(f);
    if (!job) continue;
    const high = ['Applied', 'Screened', 'Interview', 'PhoneScreen', 'Technical', 'TakeHome', 'Onsite', 'Final', 'Offer'];
    if (!high.includes(job.status)) continue;
    let body = '';
    let mtime = 0;
    try {
      body = fs.readFileSync(full, 'utf8');
      mtime = fs.statSync(full).mtimeMs;
    } catch { continue; }
    if (!body.trim()) continue;
    out.push({
      jobId: job.id,
      company: job.company ?? '',
      role: job.role ?? '',
      body: body.slice(0, 3000),
      ts: mtime,
      source: job.status === 'Applied' || job.status === 'Screened' ? 'applied' : 'high-status',
    });
  }

  // Newest-first, then truncate to limit.
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

/** Build a single-string style-reference block ready to drop into a
 *  generator prompt. Format: a small intro + 3 separated samples.
 *  Used by /api/job/[id]/cover-letter when generating fresh copy. */
export function buildStyleReferenceBlock(profileId: string): string {
  const samples = styleSamples(profileId, 3);
  if (samples.length === 0) return '';
  const intro = '\n\n## STYLE REFERENCES (the user\'s prior accepted cover letters)\n\n' +
    'Match these in tone, sentence length, opening style, and voice. The user has previously\n' +
    'sent these and they reflect what works for them — do NOT replicate the situational content,\n' +
    'replicate the STYLE.\n\n';
  return intro + samples.map((s, i) =>
    '### Sample ' + (i + 1) + ' (' + s.company + ' — ' + s.role + ')\n\n```\n' + s.body + '\n```\n'
  ).join('\n');
}

/** Reference path for the per-profile style cache that callers can use
 *  to display "based on N prior cover letters" in the UI. */
export function styleCacheStats(profileId: string): { samples: number; latestTs: number | null } {
  const s = styleSamples(profileId, 999);
  return { samples: s.length, latestTs: s[0]?.ts ?? null };
}
