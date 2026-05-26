// See https://kit.svelte.dev/docs/types#app

import type { auth } from '$lib/server/auth';

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type AuthUser = NonNullable<AuthSession>['user'];
type AuthSessionRow = NonNullable<AuthSession>['session'];

declare global {
  /** App version (root package.json) injected by vite `define`. May be
   *  undefined where the define isn't applied (e.g. some test runners), so
   *  always read it with a fallback. */
  const __APP_VERSION__: string | undefined;

  namespace App {
    interface Locals {
      /** Active user (null when unauthenticated). Populated by hooks.server.ts
       *  on every request from the Better Auth session cookie. */
      user: AuthUser | null;
      /** Active Better Auth session row (null when unauthenticated). */
      session: AuthSessionRow | null;
    }
  }
}

export {};
