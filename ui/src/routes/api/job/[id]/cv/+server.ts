/**
 * Per-job tailored CV generation.
 *
 * Spawns Claude Code's `/career-ops oferta <url>` mode in the background. The
 * mode reads cv.md + the job posting and produces:
 *   - reports/{n}-{slug}-{date}.md (deep eval)
 *   - output/{n}-{slug}-{date}.pdf (tailored CV)
 *
 * Returns immediately; progress is streamed to the activity feed via the
 * orchestrator's logEvent calls. Caller polls `/api/run` (GET) to see whether
 * the `oferta` task is still running.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { runOferta } from '$lib/server/orchestrator';
import { reportServerError } from '$lib/server/events';

export const POST = wrap('job-cv', async ({ params }: { params: { id: string } }) => {
  const jobs = loadAllJobs();
  const job = jobs.find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  if (!job!.url) badRequest('Job has no URL — cannot run oferta');

  // Fire and forget — the activity feed is the source of truth for progress.
  // runOferta resolves with {ok, code} rather than throwing, but the outer
  // catch covers truly exceptional rejection paths.
  runOferta(job!.url).catch((err) =>
    reportServerError('job-cv', 'Oferta rejected for ' + (job!.company || job!.id), err, {
      category: 'task',
    }),
  );
  return {
    ok: true,
    message: 'Generating tailored CV — watch the activity feed. This typically takes 1–3 minutes per job.',
  };
});
