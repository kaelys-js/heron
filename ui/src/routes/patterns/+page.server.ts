import { listSuggestions } from '$lib/server/pattern-suggestions';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile');
  const profileId = profileParam && profileParam !== 'all' && getProfile(profileParam)
    ? profileParam
    : getActiveProfileId();
  const { analysis, suggestions } = listSuggestions(profileId);
  return {
    profileId,
    analysis,
    suggestions,
  };
}
