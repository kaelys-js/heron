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
 *   • If there are zero users in the system, redirect to /signup --
 *     the very first user becomes the owner.
 *   • Otherwise expose `githubEnabled` so the page can conditionally
 *     render the "Sign in with GitHub" button.
 *
 * Open-redirect mitigation: the `redirectTo` query param is passed through
 * `safeRedirectTo()` which strips anything that isn't a same-origin path
 * (starts with `/` and doesn't start with `//` or contain a scheme). An
 * attacker can't craft `/login?redirectTo=https://evil.com` and bounce a
 * logged-in user off-site.
 */
function safeRedirectTo(raw: string | null): string {
  if (!raw) {
    return '/';
  }
  // Must be a relative same-origin path. Reject:
  //   • protocol-relative (//evil.com)
  //   • absolute URLs (https://evil.com)
  //   • backslash bypass (\\evil.com -- IE/legacy)
  //   • Non-path inputs
  if (typeof raw !== 'string') {
    return '/';
  }
  if (!raw.startsWith('/')) {
    return '/';
  }
  if (raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }
  // Reject any control chars or schemes that pre-decoded through ?:
  if (/[\x00-\x1f]/.test(raw)) {
    return '/';
  }
  return raw;
}

export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  const redirectTo = safeRedirectTo(url.searchParams.get('redirectTo'));
  if (locals.user) {
    throw redirect(302, redirectTo);
  }
  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  if (n === 0) {
    throw redirect(302, '/signup?first=1');
  }
  return {
    githubEnabled: isGithubEnabled(),
    redirectTo,
  };
}
