/**
 * Post-rejection learning capture.
 *
 *   POST /api/job/[id]/post-rejection
 *     body: { wentWell?: string; surprised?: string; wouldChange?: string }
 *
 * Spawns `claude -p "/career-ops post-rejection --url <url> --notes <json>"`
 * to expand the user's notes into a story-bank entry. Appends the result
 * to interview-prep/story-bank.md (creates the file if missing) so future
 * applications + interview prep have access to the learning.
 *
 * Empty bodies are valid — the mode can introspect from applications.md
 * and the report alone, useful when the user just wants the system to
 * derive learnings without typing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';

// Story-bank stays SHARED across profiles per architecture decision —
// rejection learnings are cross-track wisdom (negotiation, behavioral
// stories, communication patterns), not tied to a specific career identity.
const STORY_BANK = path.join(ROOT, 'interview-prep', 'story-bank.md');

type Notes = {
  wentWell?: string;
  surprised?: string;
  wouldChange?: string;
};

function spawnPostRejection(url: string, notes: Notes, profileId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const args = ['-p',
      '/' + CLI_NAMESPACE + ' post-rejection ' + url +
      ' --notes ' + JSON.stringify(JSON.stringify(notes)),
      '--dangerously-skip-permissions',
    ];
    // Swap symlinks so the slash-command reads this job's profile data
    // (CV, profile.yml, applications.md, the report file) and not the
    // currently-active profile's.
    try { swapProfileSymlinks(profileId); } catch (e) {
      logEvent('post-rejection', 'Symlink swap failed — capture may read wrong profile', {
        level: 'warn', category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const p = spawn('claude', args, { cwd: ROOT, env: { ...process.env } });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      resolve(stdout);
    });
  });
}

function appendToStoryBank(jobLabel: string, content: string): string {
  fs.mkdirSync(path.dirname(STORY_BANK), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const header = '\n\n---\n\n## ' + stamp + ' · ' + jobLabel + '\n\n';
  const block = header + content.trim() + '\n';
  fs.appendFileSync(STORY_BANK, block);
  return path.relative(ROOT, STORY_BANK);
}

export const POST = wrap(
  'post-rejection',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL — cannot capture rejection learning');

    const body = (await request.json().catch(() => ({}))) as Notes;
    const notes: Notes = {
      wentWell: body.wentWell?.trim() || undefined,
      surprised: body.surprised?.trim() || undefined,
      wouldChange: body.wouldChange?.trim() || undefined,
    };

    logEvent('post-rejection', 'Capturing rejection learning', {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const expanded = await spawnPostRejection(job.url, notes, profileId);
      const label = (job.company || 'unknown') + (job.role ? ' · ' + job.role : '');
      const filePath = appendToStoryBank(label, expanded);
      logEvent('post-rejection', 'Captured rejection learning', {
        level: 'success',
        category: 'application',
        message: filePath,
      });
      return { ok: true, path: filePath, content: expanded };
    } catch (err) {
      reportServerError('post-rejection', 'Capture failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
