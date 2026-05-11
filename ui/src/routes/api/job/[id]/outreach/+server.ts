/**
 * LinkedIn outreach drafter.
 *
 *   POST /api/job/[id]/outreach  { persona: 'hiring-manager' | 'recruiter' | 'peer' }
 *
 * Spawns `claude -p "/career-ops contacto --url <url> --persona <persona>"`
 * to produce 2–3 cold-message variants tuned to the chosen persona. The
 * mode reads cv.md + the report file + profile.yml so the messages
 * reference the user's actual proof points instead of generic praise.
 *
 * Persists output to interview-prep/{slug}-outreach-{persona}.md so a
 * page reload restores the variants without re-spawning.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

const VALID_PERSONAS = ['hiring-manager', 'recruiter', 'peer'] as const;
type Persona = (typeof VALID_PERSONAS)[number];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'job';
}

function persistedPath(profileId: string, jobId: string, persona: Persona): string {
  return path.join(profilePath(profileId, 'interview-prep-dir'), slugify(jobId) + '-outreach-' + persona + '.md');
}

function spawnContacto(url: string, persona: Persona, jobId: string, profileId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' contacto ' + url + ' --persona ' + persona;
    // Point repo-root symlinks (cv.md, config/profile.yml, etc.) at this
    // profile's files before spawning Claude — the slash-command reads them
    // at their canonical flat paths.
    try {
      swapProfileSymlinks(profileId);
    } catch (e) {
      logEvent('outreach', 'Symlink swap failed — outreach may read wrong profile', {
        level: 'warn',
        category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
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
        const prepDir = profilePath(profileId, 'interview-prep-dir');
        fs.mkdirSync(prepDir, { recursive: true });
        const fullPath = persistedPath(profileId, jobId, persona);
        fs.writeFileSync(fullPath, stdout);
        resolve(path.relative(ROOT, fullPath));
      } catch (err) {
        reject(err);
      }
    });
  });
}

export const POST = wrap(
  'outreach',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const body = (await request.json().catch(() => ({}))) as { persona?: string };
    const persona = (VALID_PERSONAS as readonly string[]).includes(body.persona ?? '')
      ? (body.persona as Persona)
      : 'hiring-manager';

    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL — cannot draft outreach');

    logEvent('outreach', 'Drafting outreach · ' + persona, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const filePath = await spawnContacto(job.url, persona, job.id, profileId);
      const content = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
      logEvent('outreach', 'Outreach draft ready · ' + persona, {
        level: 'success',
        category: 'application',
        message: filePath,
      });
      return { ok: true, persona, path: filePath, content };
    } catch (err) {
      reportServerError('outreach', 'Outreach draft failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
