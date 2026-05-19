/** user-context -- per-request user-id context via Node AsyncLocalStorage.
 *  hooks.server.ts wraps every request in runWithUser(userId, …); any
 *  downstream helper (profiles.ts, parsers.ts, applications.ts, events.ts)
 *  can call currentUserId() without threading a param through every
 *  signature. ALS is request-scoped by design, doesn't bleed between
 *  concurrent requests, and survives await boundaries.
 *  Background jobs (autopilot, batch) run outside a request and must set
 *  context via runAsUser(userId, fn). currentUserIdOrDefault() returns
 *  '__system__' when no user is in scope; routes should prefer
 *  currentUserId() which throws, so bugs surface loudly. */
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

/** Current user id -- throws if there's no context. Use this in endpoint
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
 *  yet -- write a TODO comment when you reach for this. */
export function currentUserIdOrDefault(): string {
  return maybeCurrentUserId() ?? SYSTEM_USER;
}

export const SYSTEM_USER_ID = SYSTEM_USER;

/**
 * Compose a `process.env` snapshot with `HERON_USER_ID` injected if
 * there's a current ALS user. Use this whenever you `spawn()` a child
 * process that resolves per-user file paths -- without the env var the
 * child falls back to SYSTEM_USER and writes to legacy `data/profiles/`
 * instead of `data/users/{uid}/profiles/` (F13).
 *
 * The companion script-side helper is `scripts/lib/lib-profiles.mjs`'s
 * `resolveUserArg()`/`userFromArgv()` which prefers a `--user` CLI flag
 * but falls back to the env var. Both Python (`scripts/lib/lib_profiles.py`)
 * and Node (`scripts/lib/lib-profiles.mjs`) consumers read this env var.
 *
 * Caller patterns:
 *
 *   ```ts
 *   spawn(cmd, args, { cwd: ROOT, env: userContextEnv() });
 *   // or with extra vars:
 *   spawn(cmd, args, { cwd: ROOT, env: userContextEnv({ FOO: 'bar' }) });
 *   ```
 *
 * Safe to call outside a request context -- when no user is active, this
 * is a no-op pass-through of `process.env` (+ any extras). SYSTEM_USER_ID
 * is intentionally NOT propagated because scripts default to SYSTEM when
 * the env var is absent -- passing the sentinel explicitly is redundant
 * and would leak the internal constant into spawned-process env.
 */
export function userContextEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...extra };
  const uid = maybeCurrentUserId();
  if (uid && uid !== SYSTEM_USER) {
    merged.HERON_USER_ID = uid;
  }
  return merged;
}

/**
 * List every real user (deletedAt IS NULL) for fan-out scheduling.
 * Falls back to `[SYSTEM_USER_ID]` when no users exist yet
 * (pre-multi-user single-user mode). Pure read; no side-effects.
 *
 * Consumed by:
 *   • `autopilot.ts` for the legacy `runScanForAllProfiles()` etc.
 *   • `jobs/registry.ts:runById()` to fan registered `perUser: true`
 *     jobs across users.
 *
 * Single source of truth -- every fan-out caller hits this function so
 * adding a new "schedulable user" criterion (e.g. exclude users on a
 * 30-day cooldown after sign-up) only needs to change one place.
 */
export async function listSchedulableUsers(): Promise<string[]> {
  try {
    const { authDb } = await import('./db');
    const { users } = await import('./db/auth-schema');
    const { isNull } = await import('drizzle-orm');
    const rows = authDb.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).all();
    if (rows.length === 0) return [SYSTEM_USER_ID];
    return rows.map((r) => r.id);
  } catch {
    // DB not initialized yet (e.g. boot-time probe) -- fall back to system.
    return [SYSTEM_USER_ID];
  }
}

/**
 * Resolve the install's OWNER userId -- the first user created on the
 * fresh install (role='owner'). Returns SYSTEM_USER_ID when no owner
 * exists yet (pre-onboarding fresh install).
 *
 * Used by single-tenant integrations that can't be parameterised per
 * user -- gmail-IMAP creds in `.env`, email-reactor side-effects, etc.
 * Those integrations stay scoped to the owner so a multi-user install
 * doesn't accidentally process the owner's inbox under member A's
 * profile (F14/F19).
 *
 * If multiple owners somehow exist (manual DB edit), the earliest one
 * by createdAt wins. Stable across owner role demotion + a new admin
 * promotion to owner -- we always pick the earliest owner so single-
 * tenant state doesn't migrate behind the user's back.
 */
export async function getOwnerUserId(): Promise<string> {
  try {
    const { authDb } = await import('./db');
    const { users } = await import('./db/auth-schema');
    const { eq, isNull, and, asc } = await import('drizzle-orm');
    const rows = authDb
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'owner'), isNull(users.deletedAt)))
      .orderBy(asc(users.createdAt))
      .limit(1)
      .all();
    return rows[0]?.id ?? SYSTEM_USER_ID;
  } catch {
    return SYSTEM_USER_ID;
  }
}
