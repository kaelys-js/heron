/**
 * /queue loader — surfaces every job in status=Queued so the user can review
 * + batch-send. Auto-queued by `auto-queue.ts` whenever a CV finishes.
 *
 * Profile-scoped: `?profile=<slug>` filters to that profile. `?profile=all`
 * shows the union across every profile (each job tagged with its profileId).
 * No query param → active profile.
 */

import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());
  const queued = loadAllJobs(profileId).filter((j) => j.status === 'Queued');
  // Sort by score descending so the strongest fits batch-send first.
  queued.sort((a, b) => (b.score ?? b.geminiScore ?? 0) - (a.score ?? a.geminiScore ?? 0));
  return { queued, profileId };
}
