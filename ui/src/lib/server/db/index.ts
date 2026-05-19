/** db/index -- SQLite singletons + Drizzle instances.
 *  Two files: auth.db (Better Auth core + passkeys, invite_codes,
 *  backup_codes, audit_log, pending_deletions) and app.db (every
 *  per-user Heron row, all user_id-scoped). Split for blast-radius
 *  isolation, independent backup cadence, and clean GDPR cascade.
 *  Paths resolve in order: HERON_DATA_DIR → HERON_AUTH_DB/HERON_APP_DB
 *  (accept ":memory:") → VITEST tmpdir → repo data/. Test isolation
 *  prevents prior runs from claiming the "first-user/owner" slot.
 *  Connections are module-load singletons; better-sqlite3 is
 *  synchronous and fine for SvelteKit's per-request model. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ROOT } from '../files';
import { BRAND } from '$lib/client/brand';
import * as authSchema from './auth-schema';
import * as appSchema from './app-schema';

/** Detect a test run -- Vitest sets VITEST and NODE_ENV=test by default. */
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

export const AUTH_DB_PATH = process.env.HERON_AUTH_DB ?? path.join(DATA_DIR, 'auth.db');
export const APP_DB_PATH = process.env.HERON_APP_DB ?? path.join(DATA_DIR, 'app.db');

/** Lazy-open raw sqlite handles. We open eagerly at module load -- the cost
 *  is microseconds and lazy-init across SSR + jobs caused weird races. */
const authSqlite = new Database(AUTH_DB_PATH);
const appSqlite = new Database(APP_DB_PATH);

// WAL mode for both -- readers don't block writers, and crashes are recoverable.
authSqlite.pragma('journal_mode = WAL');
appSqlite.pragma('journal_mode = WAL');
// Foreign keys must be enabled per-connection (off by default in SQLite).
authSqlite.pragma('foreign_keys = ON');
appSqlite.pragma('foreign_keys = ON');
// Synchronous = NORMAL is the recommended pairing with WAL -- durable enough,
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

/** Tear down -- used in tests + the verifier. */
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
