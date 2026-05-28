/** POST /api/job/[id]/offer/ev -- should-I-take EV calculator. Inputs:
 *  annualised TC (latest round), benchmark median (if attached), BATNA score,
 *  subjective 1-5 ratings (growthFit/teamFit/commuteFit/missionFit/WLB).
 *  EV-of-waiting extension: currentRoleTC?, waitDays?, waitProbability?
 *  (default 0.4 -- pipelines die ~60%), offerBTcEstimate?. Returns:
 *  ev (0-100), verdict ('strong-take'|'take'|'mixed'|'pass'), breakdown,
 *  and waiting EV when wait inputs supplied. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { getOffer, batnaScore, currentRound, annualisedTc } from '$lib/server/offers';

type Subjective = {
  growthFit?: number;
  teamFit?: number;
  commuteFit?: number;
  missionFit?: number;
  workLifeBalance?: number;
};

type WaitInputs = {
  /** What you make today at your current job (annual TC). */
  currentRoleTC?: number;
  /** How many days you'd wait for offer B. */
  waitDays?: number;
  /** P(offer B materialises in waitDays). Default 0.4. */
  waitProbability?: number;
  /** Expected TC of offer B if it lands. */
  offerBTcEstimate?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalisedTc(tc: number, median?: number): number {
  if (!median || median <= 0) {
    return 50;
  }
  const ratio = tc / median;
  // 70% of median → 0; matches median → 50; 130%+ → 100.
  if (ratio >= 1.3) {
    return 100;
  }
  if (ratio >= 1.2) {
    return 85;
  }
  if (ratio >= 1.1) {
    return 70;
  }
  if (ratio >= 1.0) {
    return 60;
  }
  if (ratio >= 0.9) {
    return 45;
  }
  if (ratio >= 0.8) {
    return 30;
  }
  if (ratio >= 0.7) {
    return 15;
  }
  return 0;
}

export const POST = wrap(
  'offer-ev',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    const offer = getOffer(job.id, profileId);
    if (!offer) {
      badRequest('No offer to evaluate — POST /api/job/[id]/offer first');
    }
    const cur = currentRound(offer!);
    if (!cur) {
      badRequest('Offer has no rounds');
    }
    const body = (await request.json().catch(() => ({}))) as Subjective & WaitInputs;
    const subjective: Required<Subjective> = {
      growthFit: clamp(body.growthFit ?? 3, 1, 5),
      teamFit: clamp(body.teamFit ?? 3, 1, 5),
      commuteFit: clamp(body.commuteFit ?? 3, 1, 5),
      missionFit: clamp(body.missionFit ?? 3, 1, 5),
      workLifeBalance: clamp(body.workLifeBalance ?? 3, 1, 5),
    };
    const tc = annualisedTc(cur!);
    const tcScore = normalisedTc(tc, offer!.benchmark?.medianTc);
    const batna = batnaScore(job.id, profileId);
    const subjectiveAvg =
      (subjective.growthFit +
        subjective.teamFit +
        subjective.commuteFit +
        subjective.missionFit +
        subjective.workLifeBalance) /
      5;
    const subjectiveScore = ((subjectiveAvg - 1) / 4) * 100;
    // Weighted composite. Money matters (35%) but isn't dominant; growth
    // + team + mission together (50%) outweigh it; BATNA is a 15% bump.
    const ev = Math.round(
      tcScore * 0.35 +
        subjective.growthFit * 5 * 2 +
        subjective.teamFit * 5 * 2 +
        subjective.missionFit * 5 * 2 +
        subjective.commuteFit * 5 +
        subjective.workLifeBalance * 5 +
        batna * 0.15,
    );
    const evClamped = clamp(ev, 0, 100);
    const verdict =
      evClamped >= 80
        ? 'strong-take'
        : evClamped >= 60
          ? 'take'
          : evClamped >= 40
            ? 'mixed'
            : 'pass';
    // ── EV-of-waiting calculation ─────────────────────────────────
    // Compare three paths over a 1-year horizon:
    //   PATH_NOW:     accept this offer immediately
    //   PATH_WAIT:    decline (or stall) this offer, hold out for B
    //   PATH_STAY:    decline this offer, stay at current employer
    //
    // Each path has an expected 1-year TC. PATH_WAIT applies:
    //   P(B materialises) × tc(B)
    //     + (1 - P(B)) × tc(current, falling back to 0 if no current job)
    //   - opportunity cost of the wait (days × tc(current or this offer) / 365)
    //
    // The waiting penalty captures the very real cost that holding out
    // for a "maybe" offer means losing real money + delaying ramp.
    let waiting: Record<string, unknown> | null = null;
    if (typeof body.offerBTcEstimate === 'number' || typeof body.currentRoleTC === 'number') {
      const pB = clamp(body.waitProbability ?? 0.4, 0, 1);
      const waitDays = clamp(body.waitDays ?? 30, 0, 365);
      const tcB = body.offerBTcEstimate ?? 0;
      const tcCurrent = body.currentRoleTC ?? 0;
      const evWaitTC = pB * tcB + (1 - pB) * tcCurrent;
      const opportunityLoss = (waitDays / 365) * tc;
      const pathNowYear1 = tc; // this offer for the full year
      const pathWaitYear1 = evWaitTC - opportunityLoss;
      const pathStayYear1 = tcCurrent;
      const winner =
        pathNowYear1 >= pathWaitYear1 && pathNowYear1 >= pathStayYear1
          ? 'now'
          : pathWaitYear1 >= pathStayYear1
            ? 'wait'
            : 'stay';
      const deltaWaitNow = pathWaitYear1 - pathNowYear1;
      waiting = {
        pathNowYear1: Math.round(pathNowYear1),
        pathWaitYear1: Math.round(pathWaitYear1),
        pathStayYear1: Math.round(pathStayYear1),
        winner,
        deltaWaitMinusNow: Math.round(deltaWaitNow),
        pB,
        waitDays,
        opportunityLoss: Math.round(opportunityLoss),
        advice:
          winner === 'now'
            ? 'Take this offer now — the math favours it over waiting + over staying.'
            : winner === 'wait'
              ? 'Waiting has positive EV vs taking now, BUT only if your P(B) and tc(B) estimates are honest. Inflated estimates are how candidates lose offers.'
              : 'Stay at current job — neither offer beats the status quo in 1-year EV. Worth re-examining why you started looking.',
      };
    }

    return {
      ok: true,
      ev: evClamped,
      verdict,
      breakdown: {
        tcScore,
        tcEvidence: `${tc} ${
          offer!.currency
        }${offer!.benchmark?.medianTc ? ' vs band ' + offer!.benchmark.medianTc : ' (no band)'}`,
        batna,
        batnaEvidence: batna === 0 ? 'no alternative offers logged' : 'best alt vs current ratio',
        subjective,
        subjectiveScore: Math.round(subjectiveScore),
      },
      waiting,
    };
  },
);
