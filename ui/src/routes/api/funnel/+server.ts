/**
 * GET /api/funnel
 *
 * Returns funnel-rate statistics for the current profile:
 *   applied → screened → interview → offer → accepted
 * along with conversion rates between adjacent stages.
 *
 * Powers:
 *   • /reality dashboard (Phase IX.3)
 *   • The "leverage points" section of the inbox header
 *   • iOS widget secondary tile
 */

import { wrap } from '$lib/server/api-helpers';
import { computeFunnelStats } from '$lib/server/stage-state';
import { getActiveProfileId } from '$lib/server/profiles';

export const GET = wrap('funnel', async () => {
  const profileId = getActiveProfileId();
  const stats = computeFunnelStats(profileId);
  // Identify the most-leaky stage — the smallest conversion rate. This is
  // the highest-leverage place to focus (the place where 1% improvement
  // converts to the biggest absolute offer-count gain).
  const conversions = [
    { name: 'applied→screen', rate: stats.appliedToScreen },
    { name: 'screen→interview', rate: stats.screenToInterview },
    { name: 'interview→offer', rate: stats.interviewToOffer },
    { name: 'offer→accept', rate: stats.offerToAccept },
  ];
  const leakiest = conversions
    .filter((c) => c.rate < 1 && c.rate > 0)
    .sort((a, b) => a.rate - b.rate)[0];
  return {
    ok: true,
    funnel: stats,
    leakiestStage: leakiest?.name ?? null,
    advice: leakiest
      ? funnelAdvice(leakiest.name)
      : 'Not enough data yet — log a few rejections and offers to see the bottleneck.',
  };
});

function funnelAdvice(stage: string): string {
  switch (stage) {
    case 'applied→screen':
      return 'Most rejections are pre-screen. Likely causes: targeting mismatch, CV ATS-score, or auto-filter on visa/location.';
    case 'screen→interview':
      return 'Stalls at recruiter screen. Causes: comp expectations mismatch, salary signalling, or motivation framing.';
    case 'interview→offer':
      return 'Reaching loops but not closing. Causes: weakness in a specific format (system design / coding / behavioural), or hiring-bar mismatch with target tier.';
    case 'offer→accept':
      return 'Getting offers but turning them down. Could be a positive signal (you have options) or a comp-band targeting issue.';
    default:
      return 'Targeting OK — keep going.';
  }
}
