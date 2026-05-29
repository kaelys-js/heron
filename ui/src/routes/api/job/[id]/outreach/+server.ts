/** POST /api/job/[id]/outreach -- LinkedIn outreach drafter. Body:
 *  { persona: 'hiring-manager' | 'recruiter' | 'peer' }. Spawns the contacto
 *  mode to produce 2-3 cold-message variants tuned to the persona. The mode
 *  reads cv.md + report + profile.yml so messages reference the user's actual
 *  proof points, not generic praise. Persists to interview-prep/{slug}-
 *  outreach-{persona}.md so reloads restore without re-spawning. */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';

const VALID_PERSONAS = ['hiring-manager', 'recruiter', 'peer'] as const;
type Persona = (typeof VALID_PERSONAS)[number];

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job'
  );
}

function persistedPath(profileId: string, jobId: string, persona: Persona): string {
  return path.join(
    profilePath(profileId, 'interview-prep-dir'),
    `${slugify(jobId)}-outreach-${persona}.md`,
  );
}

function spawnContacto(
  url: string,
  persona: Persona,
  jobId: string,
  profileId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const { child: p } = spawnAgentWithMode('outreach', `${url} --persona ${persona}`, {
      profileId,
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
        reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 300)}`));
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
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    if (!job.url) {
      badRequest('Job has no URL — cannot draft outreach');
    }

    logEvent('outreach', `Drafting outreach · ${persona}`, {
      level: 'info',
      category: 'application',
      message: `${job.company || '?'} · ${job.role || '?'}`,
    });

    try {
      const filePath = await spawnContacto(job.url, persona, job.id, profileId);
      const content = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
      logEvent('outreach', `Outreach draft ready · ${persona}`, {
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
