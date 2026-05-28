/**
 * /api/job/[id]/comp-preflight -- return the pre-call comp pre-flight.
 *
 * GET → { ask, walkaway, currency, advice, warning? }
 *
 * Used by JobActions when the job is in an interview stage so the user
 * has a clear "ask for $X, walkaway at $Y" reminder before picking up
 * the phone.
 */

import { wrap } from '$lib/server/api-helpers';
import { compPreflightForJob } from '$lib/server/comp-preflight';

export const GET = wrap('comp-preflight', async ({ params }: { params: { id: string } }) => {
  const preflight = compPreflightForJob(params.id);
  if (!preflight) {
    return { ok: false, error: 'Job not found' };
  }
  return { ok: true, ...preflight };
});
