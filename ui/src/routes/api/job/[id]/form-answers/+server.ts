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
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';
import { saveAnswer } from '$lib/server/form-answers-cache';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job'
  );
}

function persistedPath(profileId: string, jobId: string): string {
  return path.join(
    profilePath(profileId, 'interview-prep-dir'),
    slugify(jobId) + '-form-answers.md',
  );
}

function readCached(profileId: string, jobId: string): { path: string; body: string } | null {
  const p = persistedPath(profileId, jobId);
  try {
    if (fs.existsSync(p)) {
      return { path: path.relative(ROOT, p), body: fs.readFileSync(p, 'utf8') };
    }
  } catch {}
  return null;
}

function spawnFormAnswers(
  url: string,
  jobId: string,
  profileId: string,
): Promise<{ path: string; body: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const { child: p } = spawnAgentWithMode('form-answers', url, {
      profileId: profileId,
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      try {
        const prepDir = profilePath(profileId, 'interview-prep-dir');
        fs.mkdirSync(prepDir, { recursive: true });
        const fullPath = persistedPath(profileId, jobId);
        // The mode is supposed to write the file itself; if it didn't, persist
        // stdout as a safety net so the user always gets something.
        if (!fs.existsSync(fullPath) && stdout.trim()) {
          fs.writeFileSync(fullPath, stdout);
        }
        if (!fs.existsSync(fullPath)) {
          reject(
            new Error('Form-answers generation produced no file. Stdout: ' + stdout.slice(0, 500)),
          );
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

export const GET = wrap(
  'form-answers',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    return { cached: readCached(profileId, job.id) };
  },
);

export const POST = wrap(
  'form-answers',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL');

    logEvent('form-answers', 'Generating form answers', {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const out = await spawnFormAnswers(job.url, job.id, profileId);
      // Auto-seed the per-question cache from the markdown's "## {question}"
      // headings — each Q+A pair becomes a persistent cache entry the future
      // apply-greenhouse / apply-ashby runs can look up.
      let seeded = 0;
      try {
        seeded = seedCacheFromMarkdown(profileId, out.body);
      } catch (e) {
        logEvent('form-answers', 'Cache auto-seed failed', {
          level: 'warn',
          category: 'application',
          message: e instanceof Error ? e.message : String(e),
        });
      }
      logEvent('form-answers', 'Form answers ready', {
        level: 'success',
        category: 'application',
        message: out.path + (seeded ? ' · seeded ' + seeded + ' cache entries' : ''),
      });
      return { ok: true, path: out.path, body: out.body, seeded };
    } catch (err) {
      reportServerError('form-answers', 'Form answers failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** Parse a form-answers.md (Claude output) into Q+A pairs and persist each
 *  into the per-question cache. The mode writes "## {question}" headings
 *  followed by the answer text on subsequent lines until the next heading. */
function seedCacheFromMarkdown(profileId: string, markdown: string): number {
  if (!markdown.trim()) return 0;
  const blocks: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    // Accept "## N. Question" or "## Question"
    const m = /^##\s+(?:\d+\.\s*)?(.+)$/.exec(trimmed);
    if (m) {
      if (current) blocks.push(current);
      current = { heading: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) blocks.push(current);
  let count = 0;
  for (const b of blocks) {
    // Skip the document title (e.g. "Form answers · Acme · Senior Eng")
    if (/^form answers?\b/i.test(b.heading)) continue;
    const answer = b.body.join('\n').trim();
    // Skip empty blocks and obvious placeholder responses.
    if (!answer || /^_?n\/?a_?$/i.test(answer)) continue;
    try {
      saveAnswer(profileId, b.heading, answer);
      count++;
    } catch {
      // skip — empty key after normalization, etc.
    }
  }
  return count;
}
