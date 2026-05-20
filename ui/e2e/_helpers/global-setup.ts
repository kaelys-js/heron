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
 *   4. Per-user profile FS layout (cv.md, profile.yml, portals.yml,
 *      _profile.md, applications.md) under
 *      data/users/u_e2e/profiles/default/.
 *   5. onboarding-state.json with `completed: true` so
 *      `isFreshInstall()` short-circuits FALSE even if some files
 *      drift OR ANTHROPIC_API_KEY isn't in env (it isn't in CI).
 *      Without this the +layout.server.ts auth gate redirects
 *      anonymous root -> /onboarding -> /onboarding/account, NOT
 *      /login as the test expects.
 *
 * Counterpart: `global-teardown.ts` removes the tmpdir at end of run.
 *
 * Determinism: TEST_USER_ID + TEST_USER_EMAIL are constants exported
 * from `./seed.ts` so specs can assert against them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { TEST_USER_EMAIL, TEST_USER_ID, TEST_USER_NAME } from './seed';

// `ui/package.json` is `"type": "module"` so the playwright config +
// helpers run as ESM. ESM doesn't define `__dirname`; reconstruct it
// from `import.meta.url`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(): Promise<void> {
  const dataDir = process.env.HERON_E2E_DATA_DIR;
  if (!dataDir) {
    throw new Error(
      'global-setup: HERON_E2E_DATA_DIR not set. playwright.config.ts must ' +
        'compute + export this path BEFORE globalSetup runs.',
    );
  }

  // Non-destructive reset. Playwright doesn't guarantee globalSetup
  // runs BEFORE webServer launches; on CI the build step of the
  // webServer command imports SvelteKit route modules → which import
  // `db/index.ts` → which calls `new Database(authDbPath)` at module
  // load time. If globalSetup then `rmSync`'s the dataDir, the
  // webServer's still-open `better-sqlite3` handle survives by inode
  // but reads the OLD (empty) file, while we write our seed row into
  // a NEW file at the same path. Symptom: webServer's `count(*)` on
  // `users` returns 0 → `/login` 302's to `/signup?first=1` → the
  // anonymous-root-redirects-to-/login spec fails.
  //
  // The fix: never unlink files the webServer might already have
  // open. Wipe ONLY the profile subtrees (webServer reads those per-
  // request from disk, no open handle to break), and reset the
  // sqlite tables via DELETE statements over the SAME inode the
  // webServer holds open.
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of ['users', 'profiles', 'inbox-mbox']) {
    const p = path.join(dataDir, sub);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
  for (const f of ['profiles.json', 'activity.jsonl', 'issues.jsonl']) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }
  }

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

  // portals.yml + _profile.md round out the four required files that
  // isFreshInstall() checks. Missing ANY of these would flip
  // isFreshInstall to true and trigger the /onboarding redirect.
  fs.writeFileSync(path.join(profileDir, 'portals.yml'), 'companies: []\nqueries: []\n', 'utf8');
  fs.writeFileSync(
    path.join(profileDir, '_profile.md'),
    '# E2E Test Profile\n\nMinimal profile fragment for tests.\n',
    'utf8',
  );

  // Per-user _shared dir with onboarding-state.json set to
  // `completed: true`. This is the SHORTEST short-circuit in
  // isFreshInstall() -- it bails on the very first check before
  // even looking at the FS files OR the ANTHROPIC_API_KEY env var.
  // Defence-in-depth: even if a future check is added that we
  // haven't covered, completed=true keeps the redirect on /login.
  const sharedDir = path.join(dataDir, 'users', TEST_USER_ID, 'profiles', '_shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(
    path.join(sharedDir, 'onboarding-state.json'),
    JSON.stringify({ completed: true, completedAt: Date.now() }, null, 2),
    'utf8',
  );

  // LEGACY single-user paths -- ALSO seed at `data/profiles/default/`
  // and `data/profiles/_shared/`. When there's no session (anonymous
  // visit, which is what the redirect-to-/login test exercises),
  // `currentUserIdOrDefault()` returns SYSTEM_USER_ID and the file
  // resolvers fall back to the legacy single-user layout under
  // `data/profiles/`. The per-user `data/users/u_e2e/...` paths above
  // are read AFTER a session is established; for the no-session
  // checks we need the legacy paths populated too. Same content,
  // duplicated paths.
  const legacyProfileDir = path.join(dataDir, 'profiles', 'default');
  fs.mkdirSync(legacyProfileDir, { recursive: true });
  const legacySharedDir = path.join(dataDir, 'profiles', '_shared');
  fs.mkdirSync(legacySharedDir, { recursive: true });
  for (const [file, content] of [
    ['cv.md', '# E2E Test User\n\nSenior Software Engineer · Test University · 2020-Present'],
    [
      'profile.yml',
      'name: E2E Test User\nemail: e2e@heron.test\ntargets:\n  - "Senior Software Engineer"\n',
    ],
    ['portals.yml', 'companies: []\nqueries: []\n'],
    ['_profile.md', '# E2E Test Profile\n\nMinimal profile fragment for tests.\n'],
    [
      'applications.md',
      '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n',
    ],
  ] as const) {
    fs.writeFileSync(path.join(legacyProfileDir, file), content, 'utf8');
  }
  fs.writeFileSync(
    path.join(legacySharedDir, 'onboarding-state.json'),
    JSON.stringify({ completed: true, completedAt: Date.now() }, null, 2),
    'utf8',
  );

  // data/profiles.json -- the multi-profile registry. Without this,
  // `readProfiles()` errors with "profiles.json not found" and the
  // layout loader 500s before it can even get to isFreshInstall.
  fs.writeFileSync(
    path.join(dataDir, 'profiles.json'),
    JSON.stringify(
      {
        activeId: 'default',
        profiles: [
          {
            id: 'default',
            label: 'E2E Test Profile',
            slug: 'default',
            createdAt: Date.now(),
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  // auth.db -- minimal schema (just `users` + `schema_meta`). The
  // app's ensureSchema() on first request creates the rest (sessions,
  // accounts, verification, passkeys, etc.) -- CREATE TABLE IF NOT
  // EXISTS in the DDL means our pre-seed is preserved.
  //
  // CRITICAL inode-preservation: we OPEN the existing file (or create
  // it if absent) and reset state via DELETE statements -- we do NOT
  // unlink + recreate. better-sqlite3 readers in the webServer process
  // (which Playwright launches in parallel with this globalSetup) hold
  // the file by inode; if we unlinked the file here, those readers
  // would see an empty stale snapshot and `count(*)` on users would
  // return 0 while we wrote 1 to the new inode. Then `/login` would
  // bounce to `/signup?first=1` and the spec would fail.
  //
  // PRAGMA wal_checkpoint(TRUNCATE) right after the write forces every
  // committed page into the main DB file (vs sitting in the WAL),
  // which makes reader visibility immediate on file systems that don't
  // honour shared-mode page reads from the WAL.
  //
  // Column shapes mirror ui/src/lib/server/db/auth-schema.ts::users.
  // `email_verified` + `two_factor_enabled` are stored as INTEGER
  // (0/1) per drizzle's boolean mode.
  const authDbPath = path.join(dataDir, 'auth.db');
  const authDb = new Database(authDbPath);
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
    // Reset to a known state without unlinking the file. DELETE FROM
    // users is enough; sessions / passkeys / accounts cascade via FK
    // ON DELETE if they exist (and are harmless to skip if they don't,
    // because the spec only depends on users.count).
    authDb.exec('DELETE FROM users;');
    const now = Date.now();
    authDb
      .prepare(
        `INSERT OR REPLACE INTO users
         (id, email, email_verified, name, role, two_factor_enabled, created_at, updated_at)
         VALUES (?, ?, 1, ?, 'owner', 0, ?, ?)`,
      )
      .run(TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_NAME, now, now);
    // Flush any WAL frames into the main file so the webServer's
    // already-open handle sees the row on its very next read.
    authDb.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    authDb.close();
  }

  // Sanity check -- read back what we wrote so we know the DB file is
  // healthy + the row landed. Logged so CI debug surfaces any drift
  // between "seed says count=1" and "webServer sees count=0".
  const verifyDb = new Database(authDbPath);
  try {
    const row = verifyDb.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    console.log(`[e2e:global-setup] auth.db users count: ${row.n}`);
    if (row.n < 1) {
      throw new Error('global-setup: users count is 0 after insert. Seed broken.');
    }
  } finally {
    verifyDb.close();
  }

  // Record where the seed lives so global-teardown can rm -rf it.
  // .gitignore'd via the broader e2e/.* glob (Playwright stores
  // .last-run.json etc. here too).
  fs.writeFileSync(path.join(__dirname, '.dataDir'), dataDir, 'utf8');

  console.log(`[e2e:global-setup] Seeded HERON_DATA_DIR=${dataDir}`);
  console.log(`[e2e:global-setup] Owner user: id=${TEST_USER_ID} email=${TEST_USER_EMAIL}`);
}
