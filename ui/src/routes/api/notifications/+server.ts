/**
 * Recent activity events, scoped to the current user.
 *
 * @module
 */

import { wrap } from '$lib/server/api-helpers';
import { bus } from '$lib/server/events';
import { requireUserId } from '$lib/server/auth-helpers';

export const GET = wrap('notifications', async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  return { events: bus.recentForUser(userId) };
});
