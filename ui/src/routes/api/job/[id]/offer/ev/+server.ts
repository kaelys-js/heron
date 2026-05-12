/**
 * POST /api/job/[id]/offer/ev
 *
 * Should-I-take expected-value calculator. Combines:
 *   • Annualised TC (from the latest offer round)
 *   • Benchmark (if attached) — median band
 *   • BATNA score (best alternative offer)
 *   • User-supplied subjective ratings (1-5):
 *     - growthFit         (how much will this role accelerate my career?)
 *     - teamFit           (how excited am I about the people?)
 *     - commuteFit        (location/remote fit)
 *     - missionFit        (do I believe in the product?)
 *     - workLifeBalance   (will this protect my time?)
 *
 * Returns:
 *   ev:       0-100 composite score
 *   verdict:  'strong-take' | 'take' | 'mixed' | 'pass'
 *   breakdown: each weighted input + its contribution
 *
 * Designed to surface tension between "the money is right" and "the
 * work isn't" — both can be visible at the same time.
 */

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalisedTc(tc: number, median?: number): number {
  if (!median || median <= 0) return 50;
  const ratio = tc / median;
  // 70% of median → 0; matches median → 50; 130%+ → 100.
  if (ratio >= 1.3) return 100;
  if (ratio >= 1.2) return 85;
  if (ratio >= 1.1) return 70;
  if (ratio >= 1.0) return 60;
  if (ratio >= 0.9) return 45;
  if (ratio >= 0.8) return 30;
  if (ratio >= 0.7) return 15;
  return 0;
}

export const POST = wrap(
  'offer-ev',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const offer = getOffer(job.id, profileId);
    if (!offer) badRequest('No offer to evaluate — POST /api/job/[id]/offer first');
    const cur = currentRound(offer!);
    if (!cur) badRequest('Offer has no rounds');
    const body = (await request.json().catch(() => ({}))) as Subjective;
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
    return {
      ok: true,
      ev: evClamped,
      verdict,
      breakdown: {
        tcScore,
        tcEvidence:
          tc +
          ' ' +
          offer!.currency +
          (offer!.benchmark?.medianTc ? ' vs band ' + offer!.benchmark.medianTc : ' (no band)'),
        batna,
        batnaEvidence: batna === 0 ? 'no alternative offers logged' : 'best alt vs current ratio',
        subjective,
        subjectiveScore: Math.round(subjectiveScore),
      },
    };
  },
);
