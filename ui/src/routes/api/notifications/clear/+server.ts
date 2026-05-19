import { wrap } from '$lib/server/api-helpers';
import { bus } from '$lib/server/events';

/**
 * POST /api/notifications/clear -- empty the in-memory event buffer + truncate
 * data/activity.jsonl on disk. Errors during the disk truncate are surfaced
 * via safeConsole inside Bus.clear (we can't logEvent from here without
 * re-emitting events into the bus we're trying to clear).
 */
export const POST = wrap('notifications-clear', async () => {
  bus.clear();
  return { cleared: true };
});
