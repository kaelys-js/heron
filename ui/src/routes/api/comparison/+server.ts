/** GET /api/comparison -- every active offer for the current profile in
 *  one normalised side-by-side row. Each entry carries the job (company,
 *  role, location, score), current round (TC + base/bonus/equity/signing),
 *  benchmark band if attached, BATNA score vs. best alt, and funnel-stage
 *  history (so the UI can show "got to onsite at X but Y is in offer").
 *  Consumed by /comparison page (BATNA view + multi-offer table), the iOS
 *  top-of-deck widget, and the Apple Watch glance. */

import { wrap } from '$lib/server/api-helpers';
import { listActiveOffers, currentRound, annualisedTc, batnaScore } from '$lib/server/offers';
import { getStageState } from '$lib/server/stage-state';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { getActiveProfileId } from '$lib/server/profiles';

export const GET = wrap('comparison', async ({ url }: { url: URL }) => {
  const profileId = getActiveProfileId();
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
      base: cur?.base,
      bonus: cur?.bonus,
      signing: cur?.signing,
      equity: cur?.equity,
      otherCash: cur?.otherCash,
      receivedAt: offer.receivedAt,
      decisionDeadline: offer.decisionDeadline,
      benchmark: offer.benchmark,
      tcVsBand: offer.benchmark?.medianTc && tc ? tc / offer.benchmark.medianTc : undefined,
      batna: batnaScore(offer.jobId, profileId),
      stageHistory: stage?.stageHistory ?? [],
      lastTouchAt: stage?.lastTouchAt,
      roundsCount: offer.rounds.length,
    };
  });
  // Sort by TC desc -- strongest offer first.
  items.sort((a, b) => (b.tc ?? 0) - (a.tc ?? 0));
  return { ok: true, offers: items };
});
