/** POST /api/job/[id]/first-90-days -- draft a 30/60/90 plan for the new role.
 *  phase='closing' submits with the offer ask; phase='onboarding' aligns with
 *  the manager post-signing. Plan: 0-30 listen/learn, 31-60 ship visible win,
 *  61-90 lead measurable improvement. Output: output/{company}-first-90-days.md
 *  via the first-90-days mode (reads the deep-eval report to cite specific
 *  challenges from the JD). */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 180_000;

type Body = {
  phase?: 'closing' | 'onboarding';
  focusAreas?: string[];
  /** When 'onboarding', the user can give a list of concrete first-week
   *  goals -- recurring 1:1s, codebase tour, etc. */
  firstWeekGoals?: string[];
};

function spawnPlan(
  args: {
    profileId: string;
    jobId: string;
    company: string;
    role: string;
  } & Body,
): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      jobId: args.jobId,
      company: args.company,
      role: args.role,
      phase: args.phase ?? 'closing',
      focusAreas: args.focusAreas ?? [],
      firstWeekGoals: args.firstWeekGoals ?? [],
    };

    const { child: p } = spawnAgentWithMode('first-90-days', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { FIRST_90_DAYS_INPUT: JSON.stringify(payload) },
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
      reject(new Error('first-90-days timeout after ' + TIMEOUT_MS + 'ms'));
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

function parsePlanPath(stdout: string): string | undefined {
  const m = /PLAN_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'first-90-days',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Body;
    try {
      const { stdout } = await spawnPlan({
        profileId,
        jobId: job.id,
        company: job.company ?? '',
        role: job.role ?? '',
        phase: body.phase,
        focusAreas: body.focusAreas,
        firstWeekGoals: body.firstWeekGoals,
      });
      const planPath = parsePlanPath(stdout);
      logEvent('first-90-days', 'First-90-days plan drafted', {
        level: 'success',
        category: 'application',
        message: planPath ?? '(no path emitted)',
      });
      return { ok: true, planPath };
    } catch (err) {
      reportServerError('first-90-days', 'Plan generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
