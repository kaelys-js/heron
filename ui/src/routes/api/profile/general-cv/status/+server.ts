/** GET /api/profile/general-cv/status[?profile=<slug>]
 *  Whether a general-CV PDF exists, when it was generated, and whether
 *  cv.md has been modified since (i.e. PDF is stale -- regenerate). */
import { wrap } from '$lib/server/api-helpers';
import { generalCvStatus } from '$lib/server/cv-pdf';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export const GET = wrap('general-cv-status', async ({ url }: { url: URL }) => {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  return generalCvStatus(profileId);
});
