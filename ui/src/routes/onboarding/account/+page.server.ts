import { redirect } from '@sveltejs/kit';
import { authDb } from '$lib/server/db';
import { users } from '$lib/server/db/auth-schema';
import { sql } from 'drizzle-orm';
import { isGithubEnabled } from '$lib/server/auth';

/**
 * Onboarding step 0 — "Create your account".
 *
 * This is the very first thing a brand-new install asks for. Until a user
 * exists, the rest of the wizard is meaningless because we have no
 * `user_id` to scope per-user data to.
 *
 *   • Zero users   → render the welcome-and-create-account CTA.
 *   • One+ users   → user is already authed (the route guard would have
 *                    bounced anonymous traffic before reaching here); pass
 *                    them through to the regular wizard.
 *   • Already authed → skip straight to /onboarding (the welcome step).
 *
 * The actual passkey/GitHub/invite-code UI lives at /signup and /login —
 * this page is just the wizard's framing of that flow so first-run users
 * don't feel dropped into a bare login screen.
 */
export async function load({ locals }: { locals: App.Locals }) {
  if (locals.user) {
    // They're already signed in; move on to the rest of the wizard.
    throw redirect(302, '/onboarding');
  }
  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  return {
    isFirstUser: n === 0,
    githubEnabled: isGithubEnabled(),
  };
}
