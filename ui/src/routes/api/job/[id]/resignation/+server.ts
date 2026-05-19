/** POST /api/job/[id]/resignation -- draft a resignation letter for the
 *  user's CURRENT employer (not the new job). New-job context (company +
 *  role) only frames the letter for the agent -- the body is addressed to
 *  the user's current manager + HR. Body: { currentEmployer, currentManager?,
 *  lastDay? (ISO), noticeWeeks? (derived if lastDay omitted),
 *  tone?: 'formal'|'warm'|'concise', reason? (user summary; agent rewrites) }.
 *  Output: output/resignation-{YYYY-MM-DD}.md via the resignation mode. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 90_000;

type Body = {
  currentEmployer?: string;
  currentManager?: string;
  lastDay?: string;
  noticeWeeks?: number;
  tone?: 'formal' | 'warm' | 'concise';
  reason?: string;
};

function spawnResignation(
  args: {
    profileId: string;
    newCompany: string;
    newRole: string;
  } & Required<Pick<Body, 'currentEmployer' | 'tone'>> &
    Body,
): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      newCompany: args.newCompany,
      newRole: args.newRole,
      currentEmployer: args.currentEmployer,
      currentManager: args.currentManager,
      lastDay: args.lastDay,
      noticeWeeks: args.noticeWeeks,
      tone: args.tone,
      reason: args.reason,
    };

    const { child: p } = spawnAgentWithMode('resignation', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { RESIGNATION_INPUT: JSON.stringify(payload) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('resignation timeout after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolveP({ stdout });
    });
  });
}

function parseResignationPath(stdout: string): string | undefined {
  const m = /RESIGNATION_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'resignation',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Body;
    if (!body.currentEmployer) badRequest('currentEmployer is required');
    try {
      const { stdout } = await spawnResignation({
        profileId,
        newCompany: job.company ?? '',
        newRole: job.role ?? '',
        currentEmployer: body.currentEmployer!,
        currentManager: body.currentManager,
        lastDay: body.lastDay,
        noticeWeeks: body.noticeWeeks,
        tone: body.tone ?? 'formal',
        reason: body.reason,
      });
      const resignationPath = parseResignationPath(stdout);
      logEvent('resignation', 'Resignation letter drafted', {
        level: 'success',
        category: 'application',
        message: resignationPath ?? '(no path emitted)',
      });
      return { ok: true, resignationPath };
    } catch (err) {
      reportServerError('resignation', 'Resignation generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
