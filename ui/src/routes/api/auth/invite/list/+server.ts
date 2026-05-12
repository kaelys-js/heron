/**
 * GET /api/auth/invite/list  → { invites: InviteCode[] }
 *
 * Authenticated. Returns every invite the current user has created
 * (claimed + unclaimed + expired), newest first. Used by the
 * /settings/users page.
 */
import { wrap } from '$lib/server/api-helpers';
import { requireUserId } from '$lib/server/auth-helpers';
import { listInvitesFromOwner } from '$lib/server/invite-codes';

export const GET = wrap('invite-list', async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  return { invites: listInvitesFromOwner(userId) };
});
