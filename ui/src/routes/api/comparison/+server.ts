/**
 * GET /api/comparison
 *
 * Returns every active offer for the current profile in a normalised
 * form for side-by-side comparison. Each entry carries:
 *   • The job (company, role, location, score)
 *   • The current round of the offer (TC, base, bonus, equity, signing)
 *   • The benchmark band (if attached)
 *   • The BATNA score (this offer vs. best alternative)
 *   • The funnel-stage history (so the UI can show "got to onsite at X but Y is in offer")
 *
 * Used by:
 *   • /comparison page (BATNA leverage view + multi-offer table)
 *   • iOS widget (top-of-deck card)
 *   • Apple Watch glance
 */

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
