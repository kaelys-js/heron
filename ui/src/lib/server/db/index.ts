/**
 * db/index — SQLite connection singletons + Drizzle instances.
 *
 * Heron uses TWO SQLite files:
 *
 *   • auth.db  — users, sessions, oauth accounts, passkeys, invite codes,
 *                backup codes, audit log, pending deletions. Managed by
 *                Better Auth via its Drizzle adapter; we never write to
 *                these tables directly except for audit_log + invite_codes.
 *
 *   • app.db   — every per-user Heron data row (profiles, jobs,
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
 * profiles.json, etc. — system-layer, not per-profile) by default.
 *
 * ── Test / fresh-clone safety ────────────────────────────────────────
 * The DB paths are configurable via three env vars (override order):
 *   1. HERON_DATA_DIR  → both files live under that dir
 *   2. CAREER_OPS_AUTH_DB   → specific auth.db path (or ":memory:")
 *      CAREER_OPS_APP_DB    → specific app.db path  (or ":memory:")
 *   3. VITEST + NODE_ENV=test → auto-route to a fresh tmpdir so a test
 *      run NEVER touches the developer's local data/*.db. This
 *      prevents the "first-user/owner" race where prior test runs leave
 *      ghost rows in auth.db.users and a fresh-clone user can no longer
 *      be promoted to owner.
 *
 * Returned drizzle instances are SINGLETONS — module-load creates the
 * connections, all callers share. better-sqlite3 is synchronous and
 * thread-safe enough for SvelteKit's per-request model.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ROOT } from '../files';
import { BRAND } from '$lib/client/brand';
import * as authSchema from './auth-schema';
import * as appSchema from './app-schema';

/** Detect a test run — Vitest sets VITEST and NODE_ENV=test by default. */
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

/** Resolve the SQLite root dir. Order: explicit env override → tmpdir
 *  during tests → repo `data/` for normal runs. */
function resolveDataDir(): string {
  if (process.env.HERON_DATA_DIR) return process.env.HERON_DATA_DIR;
  if (IS_TEST) {
    // Per-process tmpdir so parallel test workers don't clobber each
    // other's auth.db. pid is enough; vitest re-uses process pools but
    // never two pools at the same path simultaneously. Brand-derived
    // so a rename retargets the tmp namespace consistently.
    const tmp = path.join(os.tmpdir(), `${BRAND.name}-test-${process.pid}`);
    fs.mkdirSync(tmp, { recursive: true });
    return tmp;
  }
  return path.join(ROOT, 'data');
}

const DATA_DIR = resolveDataDir();
fs.mkdirSync(DATA_DIR, { recursive: true });

export const AUTH_DB_PATH = process.env.CAREER_OPS_AUTH_DB ?? path.join(DATA_DIR, 'auth.db');
export const APP_DB_PATH = process.env.CAREER_OPS_APP_DB ?? path.join(DATA_DIR, 'app.db');

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

// Schema bootstrap. Production used to rely on auth.ts (the Better
// Auth import) to call ensureSchema(), but server-side tests and
// background timers (autopilot-circuit-breaker preflight) reach the
// DB without going through auth.ts and hit `no such table: profiles`.
// Running ensureSchema here means EVERY consumer that imports `db`
// gets a populated schema. ensureSchema is idempotent + guarded by
// its own `migrated` flag.
import { ensureSchema as __ensureSchema } from './migrate';
__ensureSchema();

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
