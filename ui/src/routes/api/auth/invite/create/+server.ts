/**
 * POST /api/auth/invite/create  → { code, expiresAt }
 *
 * Owner or admin only. Generates a 6-digit invite code that someone
 * else can redeem at signup. Codes are single-use and expire after 30
 * minutes. Members can't invite — they'd otherwise be able to onboard
 * arbitrary outsiders without the owner's consent.
 */
import { wrap } from '$lib/server/api-helpers';
import { requireOwnerOrAdmin } from '$lib/server/auth-helpers';
import { createInvite } from '$lib/server/invite-codes';
import { recordAuditEvent } from '$lib/server/audit-log';
import { logEvent } from '$lib/server/events';

export const POST = wrap('invite-create', async ({ locals }: { locals: App.Locals }) => {
  const user = requireOwnerOrAdmin(locals);
  const invite = createInvite(user.id);
  recordAuditEvent('invite-generated', {
    userId: user.id,
    details: { code: invite.code, expiresAt: invite.expiresAt },
  });
  logEvent('invite-create', 'Invite code generated', {
    level: 'info',
    category: 'user',
    message: 'expires in 30 minutes',
  });
  return { code: invite.code, expiresAt: invite.expiresAt };
});
