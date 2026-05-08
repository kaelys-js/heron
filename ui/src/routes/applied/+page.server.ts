import { loadAllJobs } from '$lib/server/parsers';

export async function load() {
  const jobs = loadAllJobs().filter((j) => ['Applied', 'Screened', 'Interview', 'Offer'].includes(j.status));
  return { jobs };
}
