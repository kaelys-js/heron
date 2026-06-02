/**
 * Root-layout landing decision. Pure (no SvelteKit/Node runtime) so the
 * precedence -- AUTH before onboarding -- is unit-tested in isolation.
 *
 * Precedence, and WHY each step matters:
 *   1. Public auth + wizard + infra paths render in place (return null). Else
 *      /login would redirect to /login (loop) and the onboarding wizard could
 *      never show its own steps.
 *   2. UNAUTHENTICATED traffic on a guarded page goes to /login. /login itself
 *      routes a zero-user system onward to /signup, so the owner's very first
 *      run lands on the passkey signup form (docs/SETUP.md) -- and a returning
 *      user sees the login form. This matches the iOS client, whose static
 *      build skips +layout.server.ts and bounces to /login on the client.
 *   3. Only AFTER authentication does an incomplete profile (fresh install)
 *      send the user into the /onboarding wizard.
 *
 * Regression this fixes: step 3 used to run before step 2, so a fresh,
 * user-less install was diverted into /onboarding/account instead of /login --
 * diverging from iOS and from the documented first-run flow.
 */
export function resolveLandingRedirect(opts: {
  pathname: string;
  search?: string;
  hasUser: boolean;
  isFresh: boolean;
  devUnlocked: boolean;
}): string | null {
  const { pathname, search = '', hasUser, isFresh, devUnlocked } = opts;

  const exempt =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/help') ||
    (devUnlocked && pathname.startsWith('/dev'));
  if (exempt) {
    return null;
  }

  if (!hasUser) {
    return `/login?redirectTo=${encodeURIComponent(pathname + search)}`;
  }

  if (isFresh) {
    return '/onboarding';
  }

  return null;
}
