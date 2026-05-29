/** job-resolver -- find a job by UI id + return the profile it lives
 *  in. Used by every /api/job/[id]/* endpoint to scope to the right
 *  profile's interview-prep, reports, and CLI workspace.
 *  Two id shapes (same contract as /job/[id]): bare urlId (looked up
 *  in active profile, falls back to cross-profile scan) and suffixed
 *  "urlId:slug" (named profile only, no fallback -- the form emitted
 *  by loadAllJobs('all') to keep ids unique).
 *  Explicit ?profile=<slug> query param ALWAYS wins. */

import type { Job } from '$lib/types';
import { loadAllJobs } from './parsers';
import { getActiveProfileId, getProfile, listProfiles } from './profiles';

export type JobWithProfile = { job: Job; profileId: string };

function splitSuffix(rawId: string): { urlId: string; profileHint?: string } {
  const colon = rawId.indexOf(':');
  if (colon < 0) {
    return { urlId: rawId };
  }
  return { urlId: rawId.slice(0, colon), profileHint: rawId.slice(colon + 1) };
}

/**
 * Look up a job by id, optionally with an explicit `?profile=<slug>` URL
 * override. Returns null if the job can't be found in any profile.
 */
export function resolveJobAndProfile(rawId: string, url?: URL): JobWithProfile | null {
  const { urlId, profileHint } = splitSuffix(rawId);
  const queryProfile = url?.searchParams.get('profile') ?? undefined;

  // Precedence: explicit query > id suffix > active profile.
  const preferredProfile =
    queryProfile && getProfile(queryProfile)
      ? queryProfile
      : profileHint && getProfile(profileHint)
        ? profileHint
        : getActiveProfileId();

  // Look in the preferred profile first.
  const preferred = loadAllJobs(preferredProfile);
  const matchInPreferred = preferred.find((j) => j.id === urlId || j.id === rawId);
  if (matchInPreferred) {
    return { job: matchInPreferred, profileId: preferredProfile };
  }

  // Fallback: scan every other profile (handles legacy bare-urlId links and
  // cross-profile job-detail navigations).
  for (const p of listProfiles()) {
    if (p.id === preferredProfile) {
      continue;
    }
    const jobs = loadAllJobs(p.id);
    const found = jobs.find((j) => j.id === urlId);
    if (found) {
      return { job: found, profileId: p.id };
    }
  }
  return null;
}
