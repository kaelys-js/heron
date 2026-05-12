/**
 * /applied loader. Joins the active-status jobs with the follow-up cadence
 * snapshot so the UI can render urgency badges per row without re-spawning
 * followup-cadence.mjs on the client.
 */

import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId } from '$lib/server/profiles';
import {
  getFollowupCadence,
  findEntryByCompanyRole,
  type FollowupEntry,
} from '$lib/server/followup-cadence';
import type { Status } from '$lib/types';

const ACTIVE: Status[] = ['Applied', 'Screened', 'Interview', 'Offer'];

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());
  const jobs = loadAllJobs(profileId).filter((j) => ACTIVE.includes(j.status));

  // Cadence snapshot is best-effort — if the script chokes (no applications
  // tracker yet, malformed file, missing node), the page still renders
  // without badges instead of crashing.
  let cadence: Awaited<ReturnType<typeof getFollowupCadence>> | null = null;
  try {
    cadence = await getFollowupCadence();
  } catch {
    cadence = null;
  }

  // Build a map<jobId, entry> via company+role match so the client can look
  // up urgency in O(1).
  const followups: Record<string, FollowupEntry> = {};
  if (cadence) {
    for (const j of jobs) {
      const e = findEntryByCompanyRole(cadence, j.company, j.role);
      if (e) followups[j.id] = e;
    }
  }

  return { jobs, followups, cadenceMeta: cadence?.metadata ?? null, profileId };
}
