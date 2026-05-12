/**
 * Insights page loader. Pulls the cached pattern-analysis snapshot so the
 * page renders instantly. Page exposes a "Refresh" button that hits
 * /api/insights/patterns?fresh=1 for a live re-run.
 */

import { getPatterns } from '$lib/server/analyze-patterns';

export async function load({ url }: { url: URL }) {
  // /insights is CROSS-PROFILE by default. `?profile=<slug>` drills into one.
  // Note: the analyze-patterns cache is shared (single file), so toggling
  // profileId returns the LAST-COMPUTED snapshot. Force=1 spawns a fresh
  // analysis scoped to the selected profile.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && queryProfile !== 'all' ? queryProfile : undefined;
  let patterns: Awaited<ReturnType<typeof getPatterns>> | null = null;
  let loadError: string | null = null;
  try {
    patterns = await getPatterns({ profileId });
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  return { patterns, loadError, profileId: profileId ?? 'all' };
}
