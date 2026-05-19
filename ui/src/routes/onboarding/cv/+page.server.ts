/** Pre-fills the textarea with whatever's already in cv.md for the target
 *  profile (resolved from `?profile=<slug>`). Also reports whether LinkedIn
 *  is connected -- the LinkedIn URL import path is only available when
 *  there's a saved authenticated session to scrape with. */
import { readSiblingFile, readProfile } from '$lib/server/profile';
import { getSource } from '$lib/server/sources';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const existing = readSiblingFile(profileId, 'cv') ?? '';
  const linkedinConnected = getSource('linkedin-auth').connected;
  const profile = readProfile(profileId);
  const linkedinUrl = profile.candidate?.linkedin
    ? profile.candidate.linkedin.startsWith('http')
      ? profile.candidate.linkedin
      : 'https://www.' + profile.candidate.linkedin.replace(/^www\./, '')
    : '';
  return { profileId, existing, linkedinConnected, linkedinUrl };
}
