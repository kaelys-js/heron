import { wrap, badRequest } from '$lib/server/api-helpers';
import { runScheduleNow } from '$lib/server/autopilot';
import type { ScheduleId } from '$lib/server/autopilot';
import { logEvent } from '$lib/server/events';

const VALID_IDS: ScheduleId[] = ['daily-scan', 'auto-gemini-after-scan', 'weekday-apply'];

export const POST = wrap('autopilot-run', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { id?: string };
  const id = body?.id;
  if (!id || !VALID_IDS.includes(id as ScheduleId)) {
    badRequest(`expected { id } where id is one of: ${VALID_IDS.join(', ')}`);
  }
  // Note the manual trigger so the activity feed shows "User ran X" before the
  // task itself starts streaming output.
  logEvent('autopilot-run', `Manual schedule trigger: ${id}`, {
    level: 'info',
    category: 'user',
    message: 'Triggered from Autopilot page',
  });
  const result = runScheduleNow(id as ScheduleId);
  if (!result.ok) {
    logEvent('autopilot-run', `Manual trigger failed: ${id}`, {
      level: 'warn',
      category: 'task',
      message: result.message,
    });
    badRequest(result.message);
  }
  return result;
});
