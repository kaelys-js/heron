/**
 * Cover letter drafter.
 *
 *   GET  /api/job/[id]/cover-letter   → returns cached file if it exists
 *   POST /api/job/[id]/cover-letter   → spawns generation, persists, returns body
 *
 * Spawns `claude -p "/career-ops cover-letter <url>"`. The mode reads cv.md +
 * profile.yml + the matching report (if any) and writes a single-page
 * cover letter to `output/{n}-{slug}-{date}-cover.md` so it lives next to
 * the existing tailored CV PDF.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { ROOT } from '$lib/server/files';
import { activePath } from '$lib/server/profile-paths';
import { logEvent, reportServerError } from '$lib/server/events';

/** Recompute on every access so the cover-letter resolver follows the
 *  currently-active profile, not the one at module-load time. */
function outputDir(): string { return activePath('output-dir'); }
import { CLI_NAMESPACE } from '$lib/config/branding';

/** The CV-pdf naming convention is `{n}-{slug}-{date}.pdf` (or with leading
 *  `cv-` prefix in some templates). The cover letter mode writes alongside as
 *  `{n}-{slug}-{date}-cover.md`. We look for either by stem stripping. */
function findCachedCover(reportFile?: string): { path: string; body: string } | null {
  if (!reportFile) return null;
  // reportFile is e.g. "047-vercel-2026-05-05.md"
  const stem = reportFile.replace(/\.md$/, '');
  const candidate = path.join(outputDir(), stem + '-cover.md');
  try {
    if (fs.existsSync(candidate)) {
      const body = fs.readFileSync(candidate, 'utf8');
      return { path: path.relative(ROOT, candidate), body };
    }
  } catch {}
  // Fallback: scan output dir for `*-cover.md` matching the stem
  try {
    const files = fs.readdirSync(outputDir()).filter((f) => f.endsWith('-cover.md'));
    const match = files.find((f) => f.startsWith(stem));
    if (match) {
      const full = path.join(outputDir(), match);
      const body = fs.readFileSync(full, 'utf8');
      return { path: path.relative(ROOT, full), body };
    }
  } catch {}
  return null;
}

function spawnCoverLetter(url: string): Promise<{ path: string; body: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' cover-letter ' + url;
    const p = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      // Mode prints "Wrote: <path>" — try to capture it; otherwise fall back
      // to scanning outputDir() for the newest *-cover.md created in last 60s.
      const m = stdout.match(/(?:wrote|saved|file)\s*[:=]?\s*([\S]+-cover\.md)/i);
      let coverPath: string | null = null;
      if (m) {
        coverPath = path.isAbsolute(m[1]) ? m[1] : path.join(ROOT, m[1]);
      } else {
        try {
          const cutoff = Date.now() - 60_000;
          const files = fs.readdirSync(outputDir())
            .filter((f) => f.endsWith('-cover.md'))
            .map((f) => ({ f, mtime: fs.statSync(path.join(outputDir(), f)).mtimeMs }))
            .filter((x) => x.mtime >= cutoff)
            .sort((a, b) => b.mtime - a.mtime);
          if (files[0]) coverPath = path.join(outputDir(), files[0].f);
        } catch {}
      }
      if (!coverPath || !fs.existsSync(coverPath)) {
        reject(new Error('Cover letter generation produced no file. Stdout: ' + stdout.slice(0, 500)));
        return;
      }
      try {
        const body = fs.readFileSync(coverPath, 'utf8');
        resolve({ path: path.relative(ROOT, coverPath), body });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export const GET = wrap('cover-letter', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  const cached = findCachedCover(job!.reportFile);
  return { cached };
});

export const POST = wrap('cover-letter', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  if (!job!.url) badRequest('Job has no URL');

  logEvent('cover-letter', 'Drafting cover letter', {
    level: 'info',
    category: 'application',
    message: (job!.company || '?') + ' · ' + (job!.role || '?'),
  });

  try {
    const out = await spawnCoverLetter(job!.url);
    logEvent('cover-letter', 'Cover letter ready', {
      level: 'success',
      category: 'application',
      message: out.path,
    });
    return { ok: true, path: out.path, body: out.body };
  } catch (err) {
    reportServerError('cover-letter', 'Cover letter draft failed', err, { category: 'application' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
