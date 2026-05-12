/**
 * user-context — per-request user-id context via Node AsyncLocalStorage.
 *
 * Legacy server-lib functions (`profiles.ts`, `parsers.ts`, `applications.ts`,
 * `events.ts`, etc.) read "the active user's data" without taking an
 * explicit `userId` param. Adding one to every signature would touch
 * dozens of callers across the codebase.
 *
 * Instead, the hooks middleware (`hooks.server.ts`) wraps every request
 * inside `runWithUser(userId, () => resolve(event))`. Anywhere downstream
 * — even deeply nested helpers — can call `currentUserId()` to read the
 * acting user without parameter plumbing.
 *
 * Why AsyncLocalStorage is safe here:
 *   • Node's ALS is request-scoped by design — each request gets its own
 *     store and they don't bleed between concurrent requests.
 *   • All our endpoints run on the same Node process; we don't fork
 *     workers mid-request.
 *   • Async/await preserves the context across `await` boundaries
 *     automatically (that's the whole point of ALS).
 *
 * Edge case — background jobs (autopilot ticks, batch workers): these
 * run OUTSIDE a request and need to set the context explicitly. The
 * `runAsUser(userId, fn)` helper is what the jobs code uses.
 *
 * Fallback — `currentUserIdOrDefault()` returns `'__system__'` when no
 * user is in scope. Callers that expect to be in a request context
 * should prefer `currentUserId()` which throws instead, so bugs surface
 * loudly instead of silently writing under a phantom system user.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const SYSTEM_USER = '__system__';

type UserStore = { userId: string };

const als = new AsyncLocalStorage<UserStore>();

/** Run `fn` with `userId` as the acting user. The current request's
 *  middleware does this once; background jobs do it before kicking off
 *  per-user work. */
export function runWithUser<T>(userId: string, fn: () => T): T {
  return als.run({ userId }, fn);
}

/** Like `runWithUser` but returns a Promise so `.then(...)` chains work. */
export async function runAsUser<T>(userId: string, fn: () => Promise<T> | T): Promise<T> {
  return als.run({ userId }, async () => fn());
}

/** Current user id — throws if there's no context. Use this in endpoint
 *  handlers / server-lib code where missing context is a bug. */
export function currentUserId(): string {
  const store = als.getStore();
  if (!store) {
    throw new Error('currentUserId() called outside of a user context');
  }
  return store.userId;
}

/** Like `currentUserId()` but returns `null` instead of throwing. Useful
 *  for read paths that legitimately may run without a user (e.g. the
 *  /api/health endpoint, autopilot's "do we have any users at all?"
 *  probe). */
export function maybeCurrentUserId(): string | null {
  const store = als.getStore();
  return store?.userId ?? null;
}

/** Return current user id, falling back to a system sentinel string. Use
 *  ONLY in legacy code that hasn't been audited for multi-user safety
 *  yet — write a TODO comment when you reach for this. */
export function currentUserIdOrDefault(): string {
  return maybeCurrentUserId() ?? SYSTEM_USER;
}

export const SYSTEM_USER_ID = SYSTEM_USER;
