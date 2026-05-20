/** POST /api/auth/invite/claim  { code, email } -- called by the signup
 *  page BEFORE the Better Auth sign-up flow. Validates that the invite
 *  code is real, unexpired, and unclaimed. The actual claim (setting
 *  claimedByUserId) happens later via /api/auth/invite/finalize once
 *  Better Auth has created the user and we know the new userId.
 *  Intentionally PUBLIC (hooks middleware exempts /api/auth/* from the
 *  auth guard) -- otherwise no unauthenticated user could validate a
 *  code before the WebAuthn ceremony. */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { lookupInvite, userCount } from '$lib/server/invite-codes';

export const POST = wrap('invite-claim', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as {
    code?: string;
    email?: string;
  } | null;
  if (!body || typeof body.code !== 'string' || typeof body.email !== 'string') {
    badRequest('expected JSON body with { code: string, email: string }');
  }
  if (userCount() === 0) {
    // No users yet -- the first signup goes through without an invite.
    badRequest('No users exist yet — sign up as the first user without a code.');
  }
  const invite = lookupInvite(body.code.trim());
  if (!invite) {
    badRequest('Invite code is unknown, expired, or already used.');
  }
  return { ok: true, expiresAt: invite.expiresAt };
});
