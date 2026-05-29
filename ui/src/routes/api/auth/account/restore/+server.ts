/**
 * POST /api/auth/account/restore
 *
 * Cancels a pending deletion. Only works while the soft-delete grace
 * window is still open; once the reaper has purged the user, the user
 * row is gone and this endpoint cannot bring it back.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireUserId } from '$lib/server/auth-helpers';
import { restoreUser } from '$lib/server/account-lifecycle';
import { recordAuditEvent } from '$lib/server/audit-log';
import { logEvent } from '$lib/server/events';

export const POST = wrap('account-restore', async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  const ok = restoreUser(userId);
  if (!ok) {
    badRequest('No pending deletion to restore.');
  }
  recordAuditEvent('account-restored', { userId });
  logEvent('account-restore', 'Account restored from pending deletion', {
    level: 'info',
    category: 'user',
  });
  return { ok: true };
});
