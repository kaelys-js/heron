/**
 * Per-job liveness check.
 *
 * POST → runs check-liveness.mjs against just this job's URL. If the verdict
 * is 'expired', auto-flips status to Closed (same as the bulk sweep).
 *
 * Returns: { verdict: 'active'|'expired'|'uncertain', reason?: string, closed: boolean }
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { checkOne } from '$lib/server/jobs/liveness.job';
import { markClosed } from '$lib/server/applications';
import { logEvent } from '$lib/server/events';

export const POST = wrap(
  'job-liveness',
  async ({ params }: { params: { id: string } }) => {
    const jobs = loadAllJobs();
    const job = jobs.find((j) => j.id === params.id);
    if (!job) badRequest('Job not found: ' + params.id);
    if (!job!.url) badRequest('Job has no URL — cannot check liveness');

    const outcome = await checkOne(job!.url);
    let closed = false;
    if (outcome.verdict === 'expired') {
      try {
        markClosed(job!.url, outcome.reason ?? 'expired');
        closed = true;
      } catch (err) {
        // markClosed itself logs via reportServerError, but surface a focused
        // warn here too so the user sees that the verdict was 'expired' but
        // the row didn't update — they may need to fix permissions on
        // applications.md or rotate a corrupt file.
        logEvent('job-liveness', 'Could not auto-close after expired verdict', {
          level: 'warn',
          category: 'application',
          message: (job!.company || '?') + ' — ' + (err instanceof Error ? err.message : String(err)),
        });
      }
    }
    logEvent('liveness', 'Per-job check: ' + outcome.verdict, {
      level: outcome.verdict === 'expired' ? 'warn' : 'info',
      category: 'system',
      message:
        (job!.company ? job!.company + ' · ' : '') + outcome.url +
        (outcome.reason ? ' · ' + outcome.reason : ''),
    });
    return {
      verdict: outcome.verdict,
      reason: outcome.reason,
      closed,
    };
  },
);
