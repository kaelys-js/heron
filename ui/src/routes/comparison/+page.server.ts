/**
 * /comparison loader — fetches active offers (with TC + benchmark + BATNA)
 * normalised by the same API that powers the iOS widget and Watch glance.
 *
 * Cross-profile by default. ?profile=<slug> narrows to one.
 */

import { listActiveOffers, currentRound, annualisedTc, batnaScore } from '$lib/server/offers';
import { getStageState } from '$lib/server/stage-state';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { getActiveProfileId } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && queryProfile !== 'all' ? queryProfile : getActiveProfileId();
  const offers = listActiveOffers(profileId);
  const items = offers.map((offer) => {
    const cur = currentRound(offer);
    const tc = cur ? annualisedTc(cur) : 0;
    const job = resolveJobAndProfile(offer.jobId, url)?.job;
    const stage = getStageState(offer.jobId, profileId);
    return {
      jobId: offer.jobId,
      company: job?.company ?? '?',
      role: job?.role ?? '?',
      location: job?.location ?? '?',
      score: job?.score,
      currency: offer.currency,
      tc,
      base: cur?.base ?? 0,
      bonus: cur?.bonus ?? 0,
      signing: cur?.signing ?? 0,
      equity: cur?.equity ?? 0,
      otherCash: cur?.otherCash ?? 0,
      receivedAt: offer.receivedAt,
      decisionDeadline: offer.decisionDeadline ?? null,
      benchmark: offer.benchmark ?? null,
      tcVsBand:
        offer.benchmark?.medianTc && tc
          ? Math.round((tc / offer.benchmark.medianTc) * 100) / 100
          : null,
      batna: batnaScore(offer.jobId, profileId),
      stageHistory: stage?.stageHistory ?? [],
      lastTouchAt: stage?.lastTouchAt ?? null,
      roundsCount: offer.rounds.length,
    };
  });
  items.sort((a, b) => (b.tc ?? 0) - (a.tc ?? 0));
  return {
    profileId: queryProfile && queryProfile !== 'all' ? profileId : 'all',
    offers: items,
  };
}
