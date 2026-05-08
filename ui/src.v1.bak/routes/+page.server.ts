import { loadAllJobs, groupByStatus } from '$lib/server/parsers';

export async function load() {
  const jobs = loadAllJobs();
  const grouped = groupByStatus(jobs);
  return { jobs, grouped, total: jobs.length };
}
