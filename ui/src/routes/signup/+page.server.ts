import { redirect } from '@sveltejs/kit';
import { authDb } from '$lib/server/db';
import { users } from '$lib/server/db/auth-schema';
import { isGithubEnabled } from '$lib/server/auth';
import { sql } from 'drizzle-orm';

/**
 * Signup page loader.
 *
 *   • If session already exists → '/'.
 *   • If there are ZERO users in the DB, the page enters first-user
 *     mode automatically -- no invite code field, the signup becomes
 *     the workspace owner.
 *   • If users already exist, the page requires a valid 6-digit invite
 *     code (issued by an owner / admin via /settings/users).
 *
 * Security: `isFirstUser` is determined SOLELY from the DB row count.
 * We DO NOT honour any `?first=1` URL bypass -- that would be a back-
 * door letting any visitor become a second "owner" by hand-crafting
 * a URL on a publicly-reachable install (Tailscale share, LAN demo,
 * accidentally-exposed dev server, etc.). The route auto-closes
 * after the first signup and only re-opens after the DB is wiped
 * (`pnpm reset-data` nukes auth.db + app.db together).
 */
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  if (locals.user) {
    throw redirect(302, '/');
  }
  // Intentionally ignore `url.searchParams.get('first')` -- see comment
  // above. Source of truth: DB count.
  void url;
  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  const isFirstUser = n === 0;
  return {
    isFirstUser,
    githubEnabled: isGithubEnabled(),
  };
}
