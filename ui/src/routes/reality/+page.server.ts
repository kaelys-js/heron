/** /reality loader -- funnel rates + `leverage points` + hidden costs. */

import { computeFunnelStats, listStaleJobs } from '$lib/server/stage-state';
import { listActiveOffers, currentRound, annualisedTc } from '$lib/server/offers';
import { findUpcomingInterviews, findThankYousOwed } from '$lib/server/interviewers';
import { getActiveProfileId } from '$lib/server/profiles';

const DAYS_TO_GHOST = 21;
const DAYS_PREP_REQUIRED = 5;

export async function load() {
  const profileId = getActiveProfileId();
  const funnel = computeFunnelStats(profileId);
  const offers = listActiveOffers(profileId);
  const upcoming = findUpcomingInterviews(DAYS_PREP_REQUIRED, profileId);
  const thankYousOwed = findThankYousOwed(profileId);
  const stale = listStaleJobs(DAYS_TO_GHOST, profileId);

  const leverage: { kind: string; signal: string; jobId?: string }[] = [];
  for (const o of offers) {
    if (o.decisionDeadline) {
      const hours = Math.ceil((o.decisionDeadline - Date.now()) / (60 * 60 * 1000));
      if (hours > 0 && hours < 72) {
        leverage.push({
          kind: 'decision-deadline',
          signal: 'Offer decision due in ' + hours + 'h',
          jobId: o.jobId,
        });
      }
    }
    if (o.rounds.length > 1) {
      leverage.push({
        kind: 'active-negotiation',
        signal: 'Negotiation round ' + o.rounds.length + ' in progress',
        jobId: o.jobId,
      });
    }
  }
  if (offers.length >= 2) {
    const top = offers
      .map((o) => ({ jobId: o.jobId, tc: currentRound(o) ? annualisedTc(currentRound(o)!) : 0 }))
      .sort((a, b) => b.tc - a.tc);
    leverage.push({
      kind: 'multi-offer',
      signal: offers.length + ' competing offers — best TC ' + top[0].tc + ' vs next ' + top[1].tc,
    });
  }

  const hiddenCosts: { kind: string; count: number; severity: 'info' | 'warn' | 'error' }[] = [];
  if (thankYousOwed.length) {
    hiddenCosts.push({
      kind: 'thank-you-owed',
      count: thankYousOwed.length,
      severity: thankYousOwed.length >= 3 ? 'error' : 'warn',
    });
  }
  const upcomingWithoutDossier = upcoming.filter((u) => !u.interviewer.dossierPath).length;
  if (upcomingWithoutDossier) {
    hiddenCosts.push({
      kind: 'prep-missing',
      count: upcomingWithoutDossier,
      severity: upcomingWithoutDossier >= 2 ? 'error' : 'warn',
    });
  }
  if (stale.length) {
    hiddenCosts.push({
      kind: 'silent-applications',
      count: stale.length,
      severity: stale.length >= 5 ? 'error' : 'info',
    });
  }

  const conversions = [
    { name: 'applied→screen', rate: funnel.appliedToScreen },
    { name: 'screen→interview', rate: funnel.screenToInterview },
    { name: 'interview→offer', rate: funnel.interviewToOffer },
    { name: 'offer→accept', rate: funnel.offerToAccept },
  ];
  const leakiest = conversions
    .filter((c) => c.rate < 1 && c.rate > 0)
    .sort((a, b) => a.rate - b.rate)[0];
  const enoughData = funnel.applied >= 5;
  const advice = enoughData
    ? leakiest
      ? funnelAdvice(leakiest.name)
      : 'Pipeline looks healthy at every stage.'
    : 'Apply to a few more roles to see meaningful funnel signal.';

  return {
    funnel,
    conversions,
    leverage,
    hiddenCosts,
    leakiest: leakiest ?? null,
    enoughData,
    advice,
  };
}

function funnelAdvice(stage: string): string {
  switch (stage) {
    case 'applied→screen':
      return 'Likely causes: targeting mismatch (filter on visa/level), CV ATS score, or auto-filter by location.';
    case 'screen→interview':
      return 'Likely causes: comp expectations mismatch, motivation framing too generic, recruiter signal weak.';
    case 'interview→offer':
      return 'Reaching loops, not closing. Causes: weakness in a specific format (system design / coding / behavioural), or hiring-bar mismatch with target tier.';
    case 'offer→accept':
      return 'Could be a positive signal (you have options) or a comp-band targeting issue. Look at TC vs benchmark.';
    default:
      return 'Targeting looks OK — keep going.';
  }
}
