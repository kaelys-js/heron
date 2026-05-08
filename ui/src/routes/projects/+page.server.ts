import { listProjects, computeStats, getStarterTemplates } from '$lib/server/projects';
import { loadAllJobs } from '$lib/server/parsers';

export async function load() {
  const projects = listProjects();
  const jobs = loadAllJobs();
  const stats: Record<string, ReturnType<typeof computeStats>> = {};
  for (const p of projects) stats[p.id] = computeStats(p, jobs);
  return {
    projects,
    stats,
    starters: getStarterTemplates(),
    totalJobs: jobs.length,
  };
}
