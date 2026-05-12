// See https://kit.svelte.dev/docs/types#app

import type { auth } from '$lib/server/auth';

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type AuthUser = NonNullable<AuthSession>['user'];
type AuthSessionRow = NonNullable<AuthSession>['session'];

declare global {
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
