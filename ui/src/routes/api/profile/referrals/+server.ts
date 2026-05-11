/**
 * /api/profile/referrals — referral-ask tracker + LinkedIn search URL.
 *
 * GET ?company=Acme → { url, asks: ReferralAsk[], silent: ReferralAsk[] }
 *   - url: the LinkedIn mutuals search URL for a given company
 *   - asks: all prior referral asks for THIS profile
 *   - silent: asks pending >7 days with no reply (follow-up candidates)
 *
 * POST body: { jobId, company, contactName, contactLinkedIn?, notes? }
 *   - log a new ask (defaults to status='asked', askedAt=now)
 *
 * PATCH body: { jobId, contactName, status, notes? }
 *   - update an existing ask's status (replied-yes / replied-no / silent)
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  listAsks, logAsk, silentAsks, linkedInMutualsUrl,
  type ReferralAsk,
} from '$lib/server/referrals';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

export const GET = wrap('referrals', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  const company = url.searchParams.get('company') ?? '';
  return {
    url: company ? linkedInMutualsUrl(company) : null,
    asks: listAsks(profileId),
    silent: silentAsks(profileId, 7),
  };
});

export const POST = wrap('referrals', async ({ request, url }: { request: Request; url: URL }) => {
  const profileId = resolveProfileId(url);
  const body = (await request.json().catch(() => ({}))) as Partial<ReferralAsk>;
  if (!body.jobId || !body.company || !body.contactName) {
    badRequest('jobId + company + contactName required');
  }
  const ask: ReferralAsk = {
    jobId: body.jobId!,
    company: body.company!,
    contactName: body.contactName!,
    contactLinkedIn: body.contactLinkedIn,
    askedAt: body.askedAt ?? Date.now(),
    status: body.status ?? 'asked',
    notes: body.notes,
  };
  logAsk(profileId, ask);
  return { ok: true, ask };
});

export const PATCH = wrap('referrals', async ({ request, url }: { request: Request; url: URL }) => {
  const profileId = resolveProfileId(url);
  const body = (await request.json().catch(() => ({}))) as Partial<ReferralAsk>;
  if (!body.jobId || !body.contactName || !body.status) {
    badRequest('jobId + contactName + status required');
  }
  // Append a new row with the updated status — last-write-wins in listAsks.
  const existing = listAsks(profileId).find(
    (a) => a.jobId === body.jobId && a.contactName.toLowerCase() === body.contactName!.toLowerCase(),
  );
  if (!existing) badRequest('Ask not found — POST first to log the initial ask');
  const ask: ReferralAsk = {
    ...existing!,
    status: body.status!,
    notes: body.notes ?? existing!.notes,
    // Don't change askedAt — preserve original ask timestamp.
  };
  logAsk(profileId, ask);
  return { ok: true, ask };
});
