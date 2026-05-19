/** Loads masked existing keys so the form pre-fills if the user is
 *  resuming the wizard after a partial setup. Also flags whether all
 *  required keys are already set -- used by the 2nd+ profile onboarding
 *  flow to show "Keys already configured -- continue" path. */
import { readEnvMasked, readEnv } from '$lib/server/env';
import { getActiveProfileId, getProfile, listProfiles } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const env = readEnv();
  // Required = Anthropic only (Gemini is recommended but not blocking).
  const hasRequiredKeys = !!env.ANTHROPIC_API_KEY;
  // If the user is onboarding a SECOND+ profile (not the first one) and
  // keys are already configured, the form short-circuits with a "skip"
  // path. The user can still expand to edit.
  const isAdditionalProfile = listProfiles().length > 1;
  return {
    profileId,
    masked: readEnvMasked(),
    hasRequiredKeys,
    isAdditionalProfile,
  };
}
