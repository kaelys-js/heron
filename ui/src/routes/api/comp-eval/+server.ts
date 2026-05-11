/**
 * /api/comp-eval — evaluate a structured offer.
 *
 * POST body: OfferInput (see comp-math.ts).
 * Returns: OfferEvaluation.
 *
 * Stateless — no DB writes. The UI submits the form, gets back the
 * per-year breakdown + year-1 cash + 4-year totals + equity NPV, and
 * renders them. Save-for-later is handled client-side via localStorage
 * for now (multi-offer comparison can graduate to per-job-attached
 * later).
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { evaluateOffer, compareOffers, type OfferInput } from '$lib/server/comp-math';

export const POST = wrap('comp-eval', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  if (body?.compare && body.compare === true) {
    const a = body?.a as OfferInput | undefined;
    const b = body?.b as OfferInput | undefined;
    if (!a || !b) badRequest('Both offers (a, b) required for comparison');
    return compareOffers(a!, b!, body?.metric ?? '4yr-discounted');
  }
  const offer = body as OfferInput;
  if (typeof offer?.base !== 'number') badRequest('base (number) required');
  return evaluateOffer(offer);
});
