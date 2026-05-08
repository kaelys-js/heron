/**
 * Form-answers pre-generator.
 *
 *   GET  /api/job/[id]/form-answers   → returns cached file body if it exists
 *   POST /api/job/[id]/form-answers   → spawns generation, persists, returns body
 *
 * Spawns `claude -p "/career-ops form-answers <url>"`. The mode reads cv.md +
 * profile.yml + the matching report and writes a pre-filled Q&A markdown
 * file to `interview-prep/{slug}-form-answers.md`. The user copies each
 * answer into the matching field on the application portal manually
 * (Path A from the plan — Path B is the bookmarklet).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { ROOT } from '$lib/server/files';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';

const PREP_DIR = path.join(ROOT, 'interview-prep');

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'job';
}

function persistedPath(jobId: string): string {
  return path.join(PREP_DIR, slugify(jobId) + '-form-answers.md');
}

function readCached(jobId: string): { path: string; body: string } | null {
  const p = persistedPath(jobId);
  try {
    if (fs.existsSync(p)) {
      return { path: path.relative(ROOT, p), body: fs.readFileSync(p, 'utf8') };
    }
  } catch {}
  return null;
}

function spawnFormAnswers(url: string, jobId: string): Promise<{ path: string; body: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' form-answers ' + url;
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
      try {
        fs.mkdirSync(PREP_DIR, { recursive: true });
        const fullPath = persistedPath(jobId);
        // The mode is supposed to write the file itself; if it didn't, persist
        // stdout as a safety net so the user always gets something.
        if (!fs.existsSync(fullPath) && stdout.trim()) {
          fs.writeFileSync(fullPath, stdout);
        }
        if (!fs.existsSync(fullPath)) {
          reject(new Error('Form-answers generation produced no file. Stdout: ' + stdout.slice(0, 500)));
          return;
        }
        const body = fs.readFileSync(fullPath, 'utf8');
        resolve({ path: path.relative(ROOT, fullPath), body });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export const GET = wrap('form-answers', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  return { cached: readCached(job!.id) };
});

export const POST = wrap('form-answers', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  if (!job!.url) badRequest('Job has no URL');

  logEvent('form-answers', 'Generating form answers', {
    level: 'info',
    category: 'application',
    message: (job!.company || '?') + ' · ' + (job!.role || '?'),
  });

  try {
    const out = await spawnFormAnswers(job!.url, job!.id);
    logEvent('form-answers', 'Form answers ready', {
      level: 'success',
      category: 'application',
      message: out.path,
    });
    return { ok: true, path: out.path, body: out.body };
  } catch (err) {
    reportServerError('form-answers', 'Form answers failed', err, { category: 'application' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
