/**
 * auth-helpers -- server-side helpers that build on top of Better Auth.
 *
 * Layer 1 -- authentication (is there a session?):
 *   • requireUser(locals)         → user or 401
 *   • requireUserId(locals)       → user id or 401
 *
 * Layer 2 -- role-based access control (is this user allowed to do X?):
 *   • requireRole(locals, roles)  → user with matching role, else 403
 *   • requireOwner(locals)        → 403 unless role === 'owner'
 *   • requireOwnerOrAdmin(locals) → 403 unless role in ['owner', 'admin']
 *
 * Role model (3 tiers):
 *   - owner   : the install owner. Single user. Full access including
 *               install-wide settings (API keys, backups, danger-zone
 *               reset, user role promotion).
 *   - admin   : delegated owner. Can invite/revoke users and view all
 *               users, but cannot reset the install or change owner.
 *               Currently unused by the UI -- surfaced when a host
 *               needs an extra trusted operator alongside the owner.
 *   - member  : a regular user. Sees only their own data. Cannot affect
 *               other users or install-wide config.
 *
 * The first user created on a fresh install gets role='owner'; subsequent
 * signups via invite codes get role='member' (settable later by the owner).
 *
 * All endpoints that touch shared infra (API keys, autopilot.json,
 * sources.json, activity.jsonl, backup operations) MUST call
 * `requireOwner` or `requireOwnerOrAdmin`. Endpoints that only touch
 * per-user data only need `requireUserId`.
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { authDb } from './db';
import { users as authUsers } from './db/auth-schema';

export type UserRole = 'owner' | 'admin' | 'member';
export type LocalsUser = NonNullable<App.Locals['user']>;

/** Per-request cache: looking up role for the same user twice in one
 *  request shouldn't hit the DB twice. WeakMap keyed by the user object
 *  reference (each request gets a fresh `locals.user`). */
const roleCache = new WeakMap<object, UserRole>();

export function requireUser(locals: App.Locals): LocalsUser {
  if (!locals.user) {
    throw error(401, 'unauthenticated');
  }
  return locals.user;
}

export function requireUserId(locals: App.Locals): string {
  return requireUser(locals).id;
}

/** Convenience for `+server.ts` handlers that take `{ locals }` directly. */
export function requireUserFromEvent(event: { locals: App.Locals }): LocalsUser {
  return requireUser(event.locals);
}

/** Type guard usable in templates: `if (isAuthed(locals)) {...}`. */
export function isAuthed(locals: App.Locals): locals is App.Locals & { user: LocalsUser } {
  return locals.user !== null;
}

/** Reads the user-id from an event in one expression. */
export function userIdFromEvent(event: Pick<RequestEvent, 'locals'>): string {
  return requireUserFromEvent(event).id;
}

/** Read the role of locals.user. Better Auth's session payload doesn't
 *  include the `role` column by default, so we look it up from auth.db
 *  (cached per-request). Returns 'member' if the lookup fails -- safer
 *  fallback than promoting an unknown user to admin. */
export function userRole(locals: App.Locals): UserRole {
  const user = requireUser(locals);
  // Some session payloads include role as a custom field. Check first.
  const inlineRole = (user as unknown as { role?: string }).role;
  if (inlineRole === 'owner' || inlineRole === 'admin' || inlineRole === 'member')
    return inlineRole;
  const cached = roleCache.get(user as unknown as object);
  if (cached) return cached;
  try {
    const row = authDb
      .select({ role: authUsers.role })
      .from(authUsers)
      .where(eq(authUsers.id, user.id))
      .get();
    const role = (row?.role ?? 'member') as UserRole;
    roleCache.set(user as unknown as object, role);
    return role;
  } catch {
    return 'member';
  }
}

/** Allow the request only if the acting user's role is in `allowed`.
 *  Throws SvelteKit's error(403, 'forbidden') otherwise. */
export function requireRole(locals: App.Locals, allowed: UserRole | UserRole[]): LocalsUser {
  const user = requireUser(locals);
  const role = userRole(locals);
  const allowList = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowList.includes(role)) {
    throw error(403, 'forbidden');
  }
  return user;
}

/** Owner-only endpoints -- install-wide config (API keys, backups,
 *  danger-zone reset, role promotion). */
export function requireOwner(locals: App.Locals): LocalsUser {
  return requireRole(locals, 'owner');
}

/** Owner OR admin -- user management endpoints (invite codes, user list). */
export function requireOwnerOrAdmin(locals: App.Locals): LocalsUser {
  return requireRole(locals, ['owner', 'admin']);
}

/** Convenience: is the acting user an admin or higher? Useful for UI
 *  conditionals (show/hide a button) without throwing on false. */
export function hasAdmin(locals: App.Locals): boolean {
  if (!locals.user) return false;
  const role = userRole(locals);
  return role === 'owner' || role === 'admin';
}

/** Convenience: is the acting user the install owner? */
export function hasOwner(locals: App.Locals): boolean {
  if (!locals.user) return false;
  return userRole(locals) === 'owner';
}
