/**
 * Task runner endpoint. POST to launch a background task.
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { runScan, runGemini, runLinkedInApply, runLinkedInLogin, listRunning } from '$lib/server/orchestrator';
import { runById, has as hasJob } from '$lib/server/jobs';
import { reportServerError } from '$lib/server/events';

export const GET = wrap('run', async () => ({ running: listRunning() }));

export const POST = wrap('run', async ({ request }: any) => {
  const body = await request.json().catch(() => ({}));
  const { task, autoSubmit } = body ?? {};
  if (!task) badRequest('task required');
  // Legacy hardcoded paths — preserved verbatim for backward compat.
  switch (task) {
    case 'scan': runScan(); return { running: listRunning() };
    case 'gemini': runGemini(); return { running: listRunning() };
    case 'apply-linkedin': runLinkedInApply(!!autoSubmit); return { running: listRunning() };
    case 'apply-linkedin-login': runLinkedInLogin(); return { running: listRunning() };
  }
  // Pluggable path — any registered job id (Phase 2+ scan-portals, etc.).
  // Job's internal try/catch normalises throws to {ok: false, error}; this
  // outer .catch covers the unlikely case the promise itself rejects.
  if (hasJob(task)) {
    runById(task, body?.args ?? {}).catch((err) =>
      reportServerError('run', 'Background job ' + task + ' rejected', err, {
        category: 'task',
      }),
    );
    return { running: listRunning() };
  }
  badRequest('unknown task: ' + String(task), { task });
});
