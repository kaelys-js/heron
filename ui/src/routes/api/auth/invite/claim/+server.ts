/**
 * POST /api/auth/invite/claim   { code, email }
 *
 * Used by the signup page BEFORE the user runs through Better Auth's
 * sign-up flow. Validates that the invite code is real, unexpired, and
 * unclaimed. The actual claim (setting claimedByUserId) doesn't happen
 * until after Better Auth has created the user -- that's handled by a
 * follow-up call to /api/auth/invite/finalize once we know the new
 * user's id.
 *
 * The endpoint is intentionally PUBLIC (it sits inside /api/auth/* which
 * the hooks middleware exempts from the auth guard). Without this, no
 * unauthenticated user could check whether their code is valid before
 * surrendering it to the WebAuthn ceremony.
 */
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
