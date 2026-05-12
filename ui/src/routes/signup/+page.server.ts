import { redirect } from '@sveltejs/kit';
import { authDb } from '$lib/server/db';
import { users } from '$lib/server/db/auth-schema';
import { isGithubEnabled } from '$lib/server/auth';
import { sql } from 'drizzle-orm';

/**
 * Signup page loader.
 *
 *   • If session already exists → '/'.
 *   • `first=1` query param signals the empty-DB case (initial owner
 *     setup). The page renders without requiring an invite code.
 *   • Otherwise (users exist) we require an invite code on the form,
 *     enforced server-side in the form action (Phase 3).
 */
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  if (locals.user) throw redirect(302, '/');
  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  const isFirstUser = n === 0 || url.searchParams.get('first') === '1';
  return {
    isFirstUser,
    githubEnabled: isGithubEnabled(),
  };
}
