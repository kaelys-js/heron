import path from 'node:path';
import { loadAllJobs } from '$lib/server/parsers';
import { readSafe } from '$lib/server/files';
import { activePath } from '$lib/server/profile-paths';
import { parseReportSummary } from '$lib/server/report-summary';
import { error } from '@sveltejs/kit';

export async function load({ params }: { params: { id: string } }) {
  const jobs = loadAllJobs();
  const job = jobs.find((j) => j.id === params.id);
  if (!job) throw error(404, 'Job not found');
  const report = job.reportFile
    ? readSafe(path.join(activePath('reports-dir'), job.reportFile))
    : '';
  const summary = report ? parseReportSummary(report) : null;
  return { job, report, summary };
}
