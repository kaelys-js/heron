/**
 * GET /api/watch/active-offers
 *
 * Compact JSON payload for the Apple Watch / iOS-widget "active offers"
 * surface. Returns:
 *   {
 *     count: number,
 *     bestTc: number,
 *     bestCompany: string,
 *     bestCurrency: 'USD' | ...,
 *     soonestDeadlineMs?: number,
 *     soonestDeadlineCompany?: string,
 *   }
 */

import { wrap } from '$lib/server/api-helpers';
import { listActiveOffers, currentRound, annualisedTc } from '$lib/server/offers';
import { getActiveProfileId } from '$lib/server/profiles';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

export const GET = wrap('watch-active-offers', async ({ url }: { url: URL }) => {
  const profileId = getActiveProfileId();
  const offers = listActiveOffers(profileId);
  if (offers.length === 0) {
    return { ok: true, count: 0 };
  }
  // Best by TC
  const withTc = offers
    .map((o) => ({
      offer: o,
      tc: currentRound(o) ? annualisedTc(currentRound(o)!) : 0,
    }))
    .sort((a, b) => b.tc - a.tc);
  const best = withTc[0];
  const bestJob = resolveJobAndProfile(best.offer.jobId, url)?.job;
  // Soonest deadline
  const withDeadline = offers
    .filter((o) => o.decisionDeadline)
    .sort((a, b) => (a.decisionDeadline ?? 0) - (b.decisionDeadline ?? 0));
  const soonest = withDeadline[0];
  const soonestJob = soonest ? resolveJobAndProfile(soonest.jobId, url)?.job : undefined;
  return {
    ok: true,
    count: offers.length,
    bestTc: best.tc,
    bestCompany: bestJob?.company ?? '?',
    bestCurrency: best.offer.currency,
    bestJobId: best.offer.jobId,
    soonestDeadlineMs: soonest?.decisionDeadline ?? null,
    soonestDeadlineCompany: soonestJob?.company ?? null,
    soonestJobId: soonest?.jobId ?? null,
  };
});
