/**
 * POST /api/auth/account/delete  { confirm: 'DELETE', purgeNow?: boolean }
 *
 * Soft-deletes the current user. 30-day grace by default; pass
 * `purgeNow: true` to skip the grace and trigger an immediate hard
 * delete (used by the GDPR right-to-erasure flow).
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireUserId } from '$lib/server/auth-helpers';
import { softDeleteUser, hardDeleteUser } from '$lib/server/account-lifecycle';
import { recordAuditEvent } from '$lib/server/audit-log';
import { logEvent } from '$lib/server/events';

export const POST = wrap(
  'account-delete',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const body = (await request.json().catch(() => null)) as {
      confirm?: string;
      purgeNow?: boolean;
    } | null;
    if (!body || body.confirm !== 'DELETE') {
      badRequest('Account deletion requires { confirm: "DELETE" } in the body.');
    }
    if (body.purgeNow) {
      recordAuditEvent('account-purged', { userId });
      hardDeleteUser(userId);
      logEvent('account-delete', 'Account purged immediately', {
        level: 'warn',
        category: 'user',
      });
      return { ok: true, purged: true };
    }
    const { scheduledFor } = softDeleteUser(userId, 'user-requested');
    recordAuditEvent('deletion-requested', { userId, details: { scheduledFor } });
    logEvent('account-delete', 'Account scheduled for deletion', {
      level: 'warn',
      category: 'user',
      message: 'grace ends ' + new Date(scheduledFor).toISOString(),
    });
    return { ok: true, scheduledFor };
  },
);
