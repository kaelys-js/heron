/**
 * Bulk tailored-CV generation.
 *
 * POST { jobIds: string[] } → spawns oferta sequentially across all matched
 * URLs. The orchestrator emits per-job progress events to the activity feed
 * and a final summary "X generated · Y failed".
 *
 * We bound the queue to 25 jobs at a time to keep things sane. The caller
 * (BulkCvDialog) is expected to confirm with the user before submission.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { runBulkOferta } from '$lib/server/orchestrator';

const MAX_BULK = 25;

export const POST = wrap('bulk-cv', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { jobIds?: string[] } | null;
  const ids = Array.isArray(body?.jobIds) ? body!.jobIds.filter((s): s is string => typeof s === 'string') : [];
  if (ids.length === 0) badRequest('jobIds required (non-empty array)');
  if (ids.length > MAX_BULK) badRequest('At most ' + MAX_BULK + ' jobs per bulk run');

  const jobs = loadAllJobs();
  const urls: string[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const j = jobs.find((x) => x.id === id);
    if (j?.url) urls.push(j.url);
    else missing.push(id);
  }
  if (urls.length === 0) badRequest('No jobs found for the given ids');

  // Fire and forget — orchestrator drives the activity feed.
  runBulkOferta(urls).catch(() => {});
  return {
    ok: true,
    queued: urls.length,
    missing,
    message: 'Generating ' + urls.length + ' tailored CVs in sequence. Watch the activity feed for per-job progress.',
  };
});
