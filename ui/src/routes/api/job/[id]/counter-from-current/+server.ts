/**
 * POST /api/job/[id]/counter-from-current
 *
 * Run the counter-from-current evaluator. The new-employer job is
 * `params.id`; the user supplies their current employer + the counter
 * offer being weighed against it.
 *
 * Body:
 *   {
 *     currentEmployer, currentTitle, currentTC, currentTenureYears,
 *     newOfferTC, newOfferLevel,
 *     counterOffer: { newTitle?, newTC, otherChanges?: string[] },
 *     whyLooking, whatChangedSinceTalking
 *   }
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 180_000;

type Body = {
  currentEmployer?: string;
  currentTitle?: string;
  currentTC?: number;
  currentTenureYears?: number;
  newOfferTC?: number;
  newOfferLevel?: string;
  counterOffer?: { newTitle?: string; newTC: number; otherChanges?: string[] };
  whyLooking?: string;
  whatChangedSinceTalking?: string;
};

function spawnEvaluator(
  args: {
    profileId: string;
    jobId: string;
    newCompany: string;
    newRole: string;
  } & Body,
): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = { ...args };

    const { child: p } = spawnAgentWithMode('counter-from-current', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { COUNTER_FROM_CURRENT_INPUT: JSON.stringify(payload) },
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
      reject(new Error('counter-from-current timeout after ' + TIMEOUT_MS + 'ms'));
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

function parseCounterPath(stdout: string): string | undefined {
  const m = /COUNTER_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'counter-from-current',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Body;
    if (!body.currentEmployer) badRequest('currentEmployer is required');
    if (!body.counterOffer || typeof body.counterOffer.newTC !== 'number') {
      badRequest('counterOffer.newTC is required');
    }
    if (!body.whyLooking) {
      badRequest('whyLooking (why you started looking) is required');
    }
    try {
      const { stdout } = await spawnEvaluator({
        profileId,
        jobId: job.id,
        newCompany: job.company ?? '',
        newRole: job.role ?? '',
        ...body,
      });
      const counterPath = parseCounterPath(stdout);
      logEvent('counter-from-current', 'Counter evaluation drafted', {
        level: 'success',
        category: 'application',
        message: counterPath ?? '(no path emitted)',
      });
      return { ok: true, counterPath };
    } catch (err) {
      reportServerError('counter-from-current', 'Evaluation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
