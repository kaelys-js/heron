/**
 * GET /api/profile/general-cv/status[?profile=<slug>]
 *
 * Returns whether the user has a generated general-CV PDF, when it was
 * generated, and whether cv.md has been modified since (i.e. the PDF is
 * stale and the user should regenerate).
 *
 * Consumers:
 *   - /profile page loader (server-side import, faster path)
 *   - /profile page's refetchGeneralCvStatus() after the user replaces or
 *     reprocesses the CV file, so the "stale" badge updates without a
 *     full invalidateAll() round-trip
 *   - external integrations that need the same JSON shape over HTTP
 */
import { wrap } from '$lib/server/api-helpers';
import { generalCvStatus } from '$lib/server/cv-pdf';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export const GET = wrap('general-cv-status', async ({ url }: { url: URL }) => {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  return generalCvStatus(profileId);
});
