/**
 * POST /api/job/[id]/offer/close
 *
 * Mark the offer as accepted / declined / rescinded. This is the
 * end-of-flow action -- flips the job status to the corresponding
 * Accepted/Declined value and records the transition.
 *
 * Body: { outcome: 'accepted' | 'declined' | 'rescinded', note?: string }
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { closeOffer } from '$lib/server/offers';
import { touchJob, recordTransition } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';
import type { Status } from '$lib/types';

const STATUS_FOR_OUTCOME: Record<'accepted' | 'declined' | 'rescinded', Status> = {
  accepted: 'Accepted',
  declined: 'Declined',
  rescinded: 'Closed',
};

export const POST = wrap(
  'offer-close',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => null)) as {
      outcome?: 'accepted' | 'declined' | 'rescinded';
      note?: string;
    } | null;
    if (!body || !body.outcome || !STATUS_FOR_OUTCOME[body.outcome])
      badRequest('outcome must be accepted/declined/rescinded');
    const saved = closeOffer(job.id, body!.outcome!, profileId);
    if (!saved) badRequest('No offer exists yet');
    const newStatus = STATUS_FOR_OUTCOME[body!.outcome!];
    recordTransition(job.id, newStatus, { profileId, note: body!.note });
    touchJob(job.id, profileId);
    logEvent('offer-close', 'Offer ' + body!.outcome + ' · ' + job.company, {
      level: body!.outcome === 'accepted' ? 'success' : 'info',
      category: 'application',
      message: body!.note ?? '',
    });
    return { ok: true, offer: saved };
  },
);
