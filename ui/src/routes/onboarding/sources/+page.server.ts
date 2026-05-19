/** Loads connection state for the onboarding sources step. Sources are
 *  SHARED across profiles (a single LinkedIn auth session works for every
 *  profile), but we still pass profileId through for navigation continuity
 *  + "already connected" framing on 2nd+ profile onboarding. */
import { listSourcesWithState } from '$lib/server/sources';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const sources = listSourcesWithState();
  // True when at least one non-trivial source is already connected -- used
  // to render an "Already connected from previous profile" hint on the 2nd+
  // wizard run. Doesn't gate any action; user can still reconnect.
  const anyConnected = sources.some((s) =>
    s.id !== 'gmail-imap' && s.id !== 'linkedin-auth' && s.id !== 'indeed-auth'
      ? false
      : s.state.connected,
  );
  return { sources, profileId, anyConnected };
}
