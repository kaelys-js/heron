/**
 * POST /api/job/[id]/offer/counter
 *
 * Append a counter-round to an existing offer. Body:
 *   {
 *     kind: 'counter-by-candidate' | 'counter-by-recruiter' | 'final',
 *     base, bonus?, signing?, equity?, equityVestingYears?, equityCliffMonths?, otherCash?, notes?
 *   }
 *
 * Updates cachedTc and bumps the job into the `Negotiating` stage.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { appendRound, getOffer } from '$lib/server/offers';
import type { OfferRound } from '$lib/server/offers';
import { touchJob, recordTransition } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';

const VALID_KINDS: OfferRound['kind'][] = [
  'initial',
  'counter-by-candidate',
  'counter-by-recruiter',
  'final',
];

export const POST = wrap(
  'offer-counter',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    const existing = getOffer(job.id, profileId);
    if (!existing) {
      badRequest('No offer exists yet — POST /api/job/[id]/offer first');
    }
    const body = (await request.json().catch(() => null)) as Partial<OfferRound> | null;
    if (!body || typeof body.base !== 'number') {
      badRequest('base is required');
    }
    const kind: OfferRound['kind'] = VALID_KINDS.includes(body.kind as OfferRound['kind'])
      ? (body.kind as OfferRound['kind'])
      : 'counter-by-candidate';
    const round: OfferRound = {
      kind,
      at: Date.now(),
      base: body.base!,
      bonus: body.bonus,
      signing: body.signing,
      equity: body.equity,
      equityVestingYears: body.equityVestingYears,
      equityCliffMonths: body.equityCliffMonths,
      otherCash: body.otherCash,
      notes: body.notes,
    };
    const saved = appendRound(job.id, round, profileId);
    touchJob(job.id, profileId);
    recordTransition(job.id, 'Negotiating', {
      profileId,
      note: `${kind} round`,
    });
    logEvent('offer-counter', `${kind} round recorded`, {
      level: 'info',
      category: 'application',
      message: `${job.company || '?'} · TC ${saved?.cachedTc ?? 0} ${saved?.currency}`,
    });
    return { ok: true, offer: saved };
  },
);
