/**
 * Offer record for a single job.
 *
 * GET  /api/job/[id]/offer  → return the OfferRecord (or null)
 * POST /api/job/[id]/offer  → upsert the offer; on first POST creates the
 *                             record with a single "initial" round.
 *
 * Body shape:
 *   {
 *     currency: 'USD',
 *     receivedAt: 1700000000000,        // unix ms -- defaults to Date.now()
 *     decisionDeadline?: 1700500000000, // when recruiter wants an answer
 *     initial: {
 *       base, bonus?, signing?, equity?, equityVestingYears?, otherCash?, notes?
 *     }
 *   }
 *
 * Subsequent counter-rounds use /counter (see sibling endpoint).
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import {
  getOffer,
  upsertOffer,
  type OfferRecord,
  type OfferRound,
  type CompCurrency,
} from '$lib/server/offers';
import { touchJob, recordTransition } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';

const CURRENCIES: CompCurrency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'BRL', 'INR'];

export const GET = wrap('offer', async ({ params, url }: { params: { id: string }; url: URL }) => {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) badRequest('Job not found: ' + params.id);
  const { job, profileId } = resolved!;
  return { ok: true, offer: getOffer(job.id, profileId) ?? null };
});

export const POST = wrap(
  'offer',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => null)) as
      | (Partial<OfferRecord> & { initial?: Partial<OfferRound> })
      | null;
    if (!body || !body.currency || !CURRENCIES.includes(body.currency)) {
      badRequest('currency is required (USD/EUR/GBP/CAD/AUD/JPY/BRL/INR)');
    }
    if (!body!.initial || typeof body!.initial.base !== 'number')
      badRequest('initial.base (annual base salary) is required');
    const existing = getOffer(job.id, profileId);
    const initialRound: OfferRound = {
      kind: 'initial',
      at: existing?.rounds[0]?.at ?? Date.now(),
      base: body!.initial!.base!,
      bonus: body!.initial!.bonus,
      signing: body!.initial!.signing,
      equity: body!.initial!.equity,
      equityVestingYears: body!.initial!.equityVestingYears,
      equityCliffMonths: body!.initial!.equityCliffMonths,
      otherCash: body!.initial!.otherCash,
      notes: body!.initial!.notes,
    };
    const record: OfferRecord = {
      jobId: job.id,
      currency: body!.currency!,
      receivedAt: body!.receivedAt ?? existing?.receivedAt ?? Date.now(),
      decisionDeadline: body!.decisionDeadline ?? existing?.decisionDeadline,
      rounds: existing?.rounds.length ? existing.rounds : [initialRound],
      benchmark: existing?.benchmark,
    };
    // If the existing record is here we're EDITING the initial round.
    if (existing) {
      record.rounds = [initialRound, ...existing.rounds.slice(1)];
    }
    const saved = upsertOffer(record, profileId);
    touchJob(job.id, profileId);
    // First offer ever => Offer status. Don't downgrade later flows.
    if (!existing) recordTransition(job.id, 'Offer', { profileId, note: 'offer received' });
    logEvent('offer', 'Offer saved · ' + job.company, {
      level: 'success',
      category: 'application',
      message: 'TC ' + (saved.cachedTc ?? 0) + ' ' + saved.currency,
    });
    return { ok: true, offer: saved };
  },
);
