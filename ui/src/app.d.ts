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
    /** Shape of `page.error` -- what `handleError` returns. Beyond SvelteKit's
     *  required `message`, we add a correlation `errorId` (generated + logged in
     *  handleError, shown on the error page so a user can quote it to support)
     *  and the thrown error's `code` when present. */
    interface Error {
      message: string;
      code?: string;
      errorId?: string;
      /** Dev-only stack, returned by handleError when `dev` so the error page's
       *  developer-details block can render it. Never populated in production. */
      stack?: string;
    }

    interface Locals {
      /** Active user (null when unauthenticated). Populated by hooks.server.ts
       *  on every request from the Better Auth session cookie. */
      user: AuthUser | null;
      /** Active Better Auth session row (null when unauthenticated). */
      session: AuthSessionRow | null;
      /** Per-request correlation id (set by the first `requestId` handle step).
       *  Emitted as the `X-Request-Id` response header + a `<meta>` for the
       *  client, and reused as the error reference in handleError so one id ties
       *  the request log, the response header, and the on-screen reference. */
      requestId: string;
    }
  }
}

export {};
