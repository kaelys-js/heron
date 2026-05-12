/**
 * db/index — SQLite connection singletons + Drizzle instances.
 *
 * career-ops uses TWO SQLite files:
 *
 *   • auth.db  — users, sessions, oauth accounts, passkeys, invite codes,
 *                backup codes, audit log, pending deletions. Managed by
 *                Better Auth via its Drizzle adapter; we never write to
 *                these tables directly except for audit_log + invite_codes.
 *
 *   • app.db   — every per-user career-ops data row (profiles, jobs,
 *                applications, reports, etc.). Every row has user_id;
 *                cross-database FK enforcement happens in hooks middleware
 *                + every server-lib function being userId-scoped.
 *
 * Why two files instead of one?
 *   - Compartmentalisation: an attacker who exploits a SQL bug in app code
 *     can't pivot to the auth tables.
 *   - Backup cadence: auth.db changes rarely (logins / new sessions),
 *     app.db changes on every job edit. We can snapshot them at different
 *     frequencies.
 *   - GDPR delete: removing a user means cascading deletes in BOTH files,
 *     but the auth.db side is well-defined Better Auth behaviour. The
 *     app.db cascade is user-id-scoped and we own it.
 *
 * Both files live under `data/` (same as activity.jsonl, issues.jsonl,
 * profiles.json, etc. — system-layer, not per-profile).
 *
 * Returned drizzle instances are SINGLETONS — module-load creates the
 * connections, all callers share. better-sqlite3 is synchronous and
 * thread-safe enough for SvelteKit's per-request model.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ROOT } from '../files';
import * as authSchema from './auth-schema';
import * as appSchema from './app-schema';

const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const AUTH_DB_PATH = path.join(DATA_DIR, 'auth.db');
export const APP_DB_PATH = path.join(DATA_DIR, 'app.db');

/** Lazy-open raw sqlite handles. We open eagerly at module load — the cost
 *  is microseconds and lazy-init across SSR + jobs caused weird races. */
const authSqlite = new Database(AUTH_DB_PATH);
const appSqlite = new Database(APP_DB_PATH);

// WAL mode for both — readers don't block writers, and crashes are recoverable.
authSqlite.pragma('journal_mode = WAL');
appSqlite.pragma('journal_mode = WAL');
// Foreign keys must be enabled per-connection (off by default in SQLite).
authSqlite.pragma('foreign_keys = ON');
appSqlite.pragma('foreign_keys = ON');
// Synchronous = NORMAL is the recommended pairing with WAL — durable enough,
// much faster than FULL.
authSqlite.pragma('synchronous = NORMAL');
appSqlite.pragma('synchronous = NORMAL');

/** Drizzle wrapper over auth.db. */
export const authDb = drizzle(authSqlite, { schema: authSchema });
/** Drizzle wrapper over app.db. */
export const appDb = drizzle(appSqlite, { schema: appSchema });

/** Raw better-sqlite3 handle for auth.db (for raw SQL / migrations). */
export const authSqliteHandle = authSqlite;
/** Raw better-sqlite3 handle for app.db (for raw SQL / migrations). */
export const appSqliteHandle = appSqlite;

/** Tear down — used in tests + the verifier. */
export function closeAll(): void {
  try {
    authSqlite.close();
  } catch {
    /* already closed */
  }
  try {
    appSqlite.close();
  } catch {
    /* already closed */
  }
}
