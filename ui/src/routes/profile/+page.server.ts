import { readProfile } from '$lib/server/profile';
import { generalCvStatus } from '$lib/server/cv-pdf';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { listAnswers, cacheStats } from '$lib/server/form-answers-cache';

export async function load({ url }: { url: URL }) {
  // `?profile=<slug>` lets the user edit a non-active profile from this
  // page (e.g. update electrician's CV while default is active). Falls back
  // to the active profile.
  const profileParam = url.searchParams.get('profile');
  const profileId = profileParam && getProfile(profileParam) ? profileParam : getActiveProfileId();
  return {
    profileId,
    profile: readProfile(profileId),
    generalCv: generalCvStatus(profileId),
    formAnswers: listAnswers(profileId),
    formAnswersStats: cacheStats(profileId),
  };
}
