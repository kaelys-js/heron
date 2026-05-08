/**
 * Bulk tailored-CV generation.
 *
 * POST { jobIds: string[]; workers?: number }
 *   workers=1 (default) → sequential via runBulkOferta (one claude -p at a time)
 *   workers>1           → parallel via runBulkOfertaParallel which dispatches
 *                          batch/batch-runner.sh --parallel N
 *
 * The dialog explains the cost/speed tradeoff before submission. We bound
 * the queue to 25 jobs to keep things sane.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { runBulkOferta, runBulkOfertaParallel } from '$lib/server/orchestrator';

const MAX_BULK = 25;
const MAX_WORKERS = 8;

export const POST = wrap('bulk-cv', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { jobIds?: string[]; workers?: number } | null;
  const ids = Array.isArray(body?.jobIds) ? body!.jobIds.filter((s): s is string => typeof s === 'string') : [];
  if (ids.length === 0) badRequest('jobIds required (non-empty array)');
  if (ids.length > MAX_BULK) badRequest('At most ' + MAX_BULK + ' jobs per bulk run');

  const workers = Math.max(1, Math.min(MAX_WORKERS, Math.floor(body?.workers ?? 1)));

  const jobs = loadAllJobs();
  const urls: string[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const j = jobs.find((x) => x.id === id);
    if (j?.url) urls.push(j.url);
    else missing.push(id);
  }
  if (urls.length === 0) badRequest('No jobs found for the given ids');

  if (workers > 1) {
    runBulkOfertaParallel(urls, workers).catch(() => {});
    return {
      ok: true,
      queued: urls.length,
      missing,
      workers,
      message:
        'Generating ' + urls.length + ' tailored CVs in parallel · ' + workers + ' workers via batch-runner.sh. ' +
        'Costs more per minute but ~' + Math.ceil(workers * 0.7) + 'x faster wall-clock.',
    };
  }
  // Fire and forget — orchestrator drives the activity feed.
  runBulkOferta(urls).catch(() => {});
  return {
    ok: true,
    queued: urls.length,
    missing,
    workers: 1,
    message: 'Generating ' + urls.length + ' tailored CVs in sequence. Watch the activity feed for per-job progress.',
  };
});
