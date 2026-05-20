/**
 * Playwright globalSetup -- seeds the E2E test environment ONCE before
 * any spec runs.
 *
 * Why globalSetup (not per-spec): the Playwright webServer is launched
 * once at the start of the test run; per-test `beforeAll` seeding
 * can't reseed a running server. globalSetup runs BEFORE the webServer
 * command is spawned, so we can prepare the tmpdir + DB + first user,
 * then Playwright launches `vite preview` with HERON_DATA_DIR pointed
 * at our seed dir.
 *
 * Coordination with the webServer: playwright.config.ts computes a
 * stable HERON_E2E_DATA_DIR path (env-var override OR `os.tmpdir()/
 * heron-e2e-{ci|local}`) and writes it to process.env so globalSetup
 * + the webServer config block both read the same value. The
 * webServer's `env:` block forwards it as HERON_DATA_DIR so the
 * server's db/index.ts picks it up at module-load time.
 *
 * What gets seeded:
 *   1. tmpdir at $HERON_E2E_DATA_DIR (created if absent, recursively).
 *   2. auth.db with the minimal users + schema_meta tables. The app's
 *      ensureSchema() fills in the rest at first request (CREATE TABLE
 *      IF NOT EXISTS -- our pre-seed coexists fine).
 *   3. ONE owner-role user row (id=u_e2e, email=e2e@heron.test) so the
 *      app considers the DB "not a fresh install" and routes anonymous
 *      visits to `/login` instead of `/onboarding/account`.
 *   4. Per-user profile FS layout (cv.md, profile.yml, applications.md)
 *      under data/users/u_e2e/profiles/default/ so the user wouldn't
 *      be redirected to `/onboarding` if they DID sign in.
 *
 * Counterpart: `global-teardown.ts` removes the tmpdir at end of run.
 *
 * Determinism: TEST_USER_ID + TEST_USER_EMAIL are constants exported
 * from `./seed.ts` so specs can assert against them.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { TEST_USER_EMAIL, TEST_USER_ID, TEST_USER_NAME } from './seed';

export default async function globalSetup(): Promise<void> {
  const dataDir = process.env.HERON_E2E_DATA_DIR;
  if (!dataDir) {
    throw new Error(
      'global-setup: HERON_E2E_DATA_DIR not set. playwright.config.ts must ' +
        'compute + export this path BEFORE globalSetup runs.',
    );
  }

  // Idempotent: if a prior run left the dir, wipe + recreate so each
  // run starts from a known state.
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });

  // Per-user profile FS layout -- needed so the post-login flow
  // doesn't bounce the user back to /onboarding because cv.md is
  // missing.
  const profileDir = path.join(dataDir, 'users', TEST_USER_ID, 'profiles', 'default');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, 'cv.md'),
    '# E2E Test User\n\nSenior Software Engineer · Test University · 2020-Present',
    'utf8',
  );
  fs.writeFileSync(
    path.join(profileDir, 'profile.yml'),
    'name: E2E Test User\nemail: e2e@heron.test\ntargets:\n  - "Senior Software Engineer"\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(profileDir, 'applications.md'),
    [
      '# Applications Tracker',
      '',
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '',
    ].join('\n'),
    'utf8',
  );

  // auth.db -- minimal schema (just `users` + `schema_meta`). The
  // app's ensureSchema() on first request creates the rest (sessions,
  // accounts, verification, passkeys, etc.) -- CREATE TABLE IF NOT
  // EXISTS in the DDL means our pre-seed is preserved.
  //
  // Column shapes mirror ui/src/lib/server/db/auth-schema.ts::users.
  // `email_verified` + `two_factor_enabled` are stored as INTEGER
  // (0/1) per drizzle's boolean mode.
  const authDb = new Database(path.join(dataDir, 'auth.db'));
  try {
    authDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        image TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        two_factor_enabled INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const now = Date.now();
    authDb
      .prepare(
        `INSERT OR REPLACE INTO users
         (id, email, email_verified, name, role, two_factor_enabled, created_at, updated_at)
         VALUES (?, ?, 1, ?, 'owner', 0, ?, ?)`,
      )
      .run(TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_NAME, now, now);
  } finally {
    authDb.close();
  }

  // Record where the seed lives so global-teardown can rm -rf it.
  // .gitignore'd via the broader e2e/.* glob (Playwright stores
  // .last-run.json etc. here too).
  fs.writeFileSync(path.join(__dirname, '.dataDir'), dataDir, 'utf8');

  console.log(`[e2e:global-setup] Seeded HERON_DATA_DIR=${dataDir}`);
  console.log(`[e2e:global-setup] Owner user: id=${TEST_USER_ID} email=${TEST_USER_EMAIL}`);
}
