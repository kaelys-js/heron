import { redirect } from '@sveltejs/kit';
import { isGithubEnabled } from '$lib/server/auth';
import { authDb } from '$lib/server/db';
import { users } from '$lib/server/db/auth-schema';
import { sql } from 'drizzle-orm';

/**
 * Login page loader.
 *
 *   • If the session cookie already maps to a valid user (locals.user
 *     populated by the hooks middleware), bounce them to the redirectTo
 *     query param or '/'.
 *   • If there are zero users in the system, redirect to /signup —
 *     the very first user becomes the owner.
 *   • Otherwise expose `githubEnabled` so the page can conditionally
 *     render the "Sign in with GitHub" button.
 */
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  if (locals.user) {
    throw redirect(302, url.searchParams.get('redirectTo') ?? '/');
  }
  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  if (n === 0) {
    throw redirect(302, '/signup?first=1');
  }
  return {
    githubEnabled: isGithubEnabled(),
    redirectTo: url.searchParams.get('redirectTo') ?? '/',
  };
}
