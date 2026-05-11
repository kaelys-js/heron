import { listProjects, computeStats, getStarterTemplates } from '$lib/server/projects';
import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  // Projects are per-profile. Default to active; `?profile=<slug>` scopes
  // to a specific profile. `?profile=all` deliberately not supported here
  // because projects identity is a per-track concept — a Software Engineering
  // project doesn't sensibly merge with an Electrician one.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const projects = listProjects(profileId);
  const jobs = loadAllJobs(profileId);
  const stats: Record<string, ReturnType<typeof computeStats>> = {};
  for (const p of projects) stats[p.id] = computeStats(p, jobs);
  return {
    projectId: profileId,
    profileId,
    projects,
    stats,
    starters: getStarterTemplates(),
    totalJobs: jobs.length,
  };
}
