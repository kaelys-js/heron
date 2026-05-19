/**
 * Per-job tailored CV generation.
 *
 * Spawns Claude Code's `/heron evaluate <url>` mode in the background. The
 * mode reads cv.md + the job posting and produces:
 *   - reports/{n}-{slug}-{date}.md (deep eval)
 *   - output/{n}-{slug}-{date}.pdf (tailored CV)
 *
 * Returns immediately; progress is streamed to the activity feed via the
 * orchestrator's logEvent calls. Caller polls `/api/run` (GET) to see whether
 * the `evaluate` task is still running.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { runEvaluate } from '$lib/server/orchestrator';
import { reportServerError } from '$lib/server/events';

export const POST = wrap(
  'job-cv',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL — cannot run evaluate');

    // Fire and forget — the activity feed is the source of truth for progress.
    // runEvaluate resolves with {ok, code} rather than throwing, but the outer
    // catch covers truly exceptional rejection paths. Pass profileId so the
    // orchestrator swaps repo-root symlinks to this job's profile before
    // spawning Claude (`evaluate` writes report + PDF into that profile's
    // reports/ + output/ dirs).
    runEvaluate(job.url, 'evaluate', profileId).catch((err) =>
      reportServerError('job-cv', 'Evaluate rejected for ' + (job.company || job.id), err, {
        category: 'task',
      }),
    );
    return {
      ok: true,
      message:
        'Generating tailored CV — watch the activity feed. This typically takes 1–3 minutes per job.',
    };
  },
);
