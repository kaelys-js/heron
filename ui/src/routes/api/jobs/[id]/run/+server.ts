/**
 * Trigger a registered job by id.
 *
 *   POST /api/jobs/scan/run                         → kicks off the broad scan
 *   POST /api/jobs/gemini/run     { args: { top: 50 } }   → 50-job first-pass
 *   POST /api/jobs/normalize/run                    → manual hygiene run
 *
 * The body is optional; jobs that take args read them from `args`.
 *
 * Validates that the id exists AND that the job allows manual invocation
 * (after-event-only jobs return 400 "Cannot be triggered manually").
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { get, runById, isRunning } from '$lib/server/jobs';

export const POST = wrap(
  'jobs-run',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const def = get(params.id);
    if (!def) {
      badRequest('Unknown job: ' + params.id);
    }
    if (!def!.allowManual) {
      badRequest(`Job ${params.id} is not manually triggerable (trigger=${def!.trigger.type})`);
    }
    if (isRunning(params.id)) {
      badRequest(`Job ${params.id} is already running`);
    }
    const body = (await request.json().catch(() => ({}))) as {
      args?: Record<string, unknown>;
    } | null;
    const result = await runById(params.id, body?.args);
    // Note: don't double-write `ok` -- wrap() injects it; the runById result
    // already includes its own ok. Strip it before merging so wrap's envelope
    // stays canonical.
    const { ok: _drop, ...rest } = result as { ok: boolean } & Record<string, unknown>;
    void _drop;
    return { jobId: params.id, success: result.ok, ...rest };
  },
);
