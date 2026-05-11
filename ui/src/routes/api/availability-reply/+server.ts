/**
 * /api/availability-reply — draft the "here are 3 times" recruiter reply.
 *
 * POST body: { recruiterFirstName?, company?, role?, timezone? }
 * GET ?company=&role=&recruiter=  (convenience for query-param callers)
 *
 * Returns: { subject, body, slots: [{startIso, label}], calendarUrl?, warning? }
 *
 * Stateless. The user copies the body into their mail client. We never
 * send mail — per AGENTS.md, recruiter communications are never
 * autonomous, even with opt-in.
 */

import { wrap } from '$lib/server/api-helpers';
import { draftAvailabilityReply } from '$lib/server/availability-reply';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

export const POST = wrap('availability-reply', async ({ request, url }: { request: Request; url: URL }) => {
  const profileId = resolveProfileId(url);
  const body = (await request.json().catch(() => ({}))) as {
    recruiterFirstName?: string;
    company?: string;
    role?: string;
    timezone?: string;
  };
  return draftAvailabilityReply({ profileId, ...body });
});

export const GET = wrap('availability-reply', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  return draftAvailabilityReply({
    profileId,
    recruiterFirstName: url.searchParams.get('recruiter') ?? undefined,
    company: url.searchParams.get('company') ?? undefined,
    role: url.searchParams.get('role') ?? undefined,
    timezone: url.searchParams.get('tz') ?? undefined,
  });
});
