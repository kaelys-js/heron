import { loadAllJobs } from '$lib/server/parsers';
import { readReport } from '$lib/server/files';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const jobs = loadAllJobs();
  const job = jobs.find((j) => j.id === params.id);
  if (!job) throw error(404, 'Job not found');
  const report = job.reportFile ? readReport(job.reportFile) : '';
  return { job, report };
}
