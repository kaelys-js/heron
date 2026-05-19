/** Done-step preload -- counts the connected sources + jobs in this
 *  profile's pipeline so the celebratory summary has real numbers. */
import { listSourcesWithState } from '$lib/server/sources';
import { readSafe } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const sources = listSourcesWithState();
  const connected = sources.filter((s) => s.state.connected || s.authKind === 'always-on');

  // Count jobs in THIS profile's pipeline.md.
  const pipeline = readSafe(profilePath(profileId, 'pipeline'));
  const jobCount = (pipeline.match(/^- \[[ x]\] /gm) ?? []).length;

  return {
    profileId,
    summary: {
      connectedCount: connected.length,
      connectedLabels: connected.map((s) => s.label),
      jobCount,
    },
  };
}
