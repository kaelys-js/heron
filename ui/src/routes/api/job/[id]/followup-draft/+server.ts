/**
 * Per-job follow-up message drafter.
 *
 *   POST /api/job/[id]/followup-draft  { tone?: 'warm' | 'direct' | 'short' }
 *
 * Spawns `claude -p "/heron followup --url <url> --tone <tone>"` to
 * produce 2-3 message variants the user can copy/paste into LinkedIn or
 * email. The mode itself reads applications.md + the report file for
 * context (days since applied, contacts, what's actionable).
 *
 * Persists the result to interview-prep/{slug}-followup.md so reloads
 * don't re-spawn.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

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

function persist(profileId: string, jobId: string, body: string): string {
  const prepDir = profilePath(profileId, 'interview-prep-dir');
  fs.mkdirSync(prepDir, { recursive: true });
  const filename = slugify(jobId) + '-followup.md';
  const fullPath = path.join(prepDir, filename);
  fs.writeFileSync(fullPath, body);
  return path.relative(ROOT, fullPath);
}

function spawnFollowup(
  url: string,
  tone: string,
  jobId: string,
  profileId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const { child: p } = spawnAgentWithMode('followup', url + ' --tone ' + tone, {
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
        const persisted = persist(profileId, jobId, stdout);
        resolve(persisted);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export const POST = wrap(
  'followup-draft',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const body = (await request.json().catch(() => ({}))) as { tone?: string };
    const tone = body.tone === 'direct' || body.tone === 'short' ? body.tone : 'warm';
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL — cannot draft follow-up');

    logEvent('followup-draft', 'Drafting follow-up · ' + tone, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const filePath = await spawnFollowup(job.url, tone, job.id, profileId);
      const content = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
      logEvent('followup-draft', 'Follow-up draft ready', {
        level: 'success',
        category: 'application',
        message: filePath,
      });
      return { ok: true, path: filePath, content };
    } catch (err) {
      reportServerError('followup-draft', 'Draft failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
