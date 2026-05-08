/**
 * Task runner endpoint. POST to launch a background task.
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { runScan, runGemini, runLinkedInApply, runLinkedInLogin, listRunning } from '$lib/server/orchestrator';

export const GET = wrap('run', async () => ({ running: listRunning() }));

export const POST = wrap('run', async ({ request }: any) => {
  const body = await request.json().catch(() => ({}));
  const { task, autoSubmit } = body ?? {};
  if (!task) badRequest('task required');
  switch (task) {
    case 'scan': runScan(); break;
    case 'gemini': runGemini(); break;
    case 'apply-linkedin': runLinkedInApply(!!autoSubmit); break;
    case 'apply-linkedin-login': runLinkedInLogin(); break;
    default:
      badRequest('unknown task: ' + String(task), { task });
  }
  return { running: listRunning() };
});
