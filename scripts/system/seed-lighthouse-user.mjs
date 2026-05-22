#!/usr/bin/env node
/**
 * seed-lighthouse-user -- full E2E + Lighthouse + Lost Pixel data-dir
 * seeding. Inserts the `u_e2e` user into auth.db AND the per-user
 * profile FS layout AND the legacy single-user fallback paths AND the
 * onboarding-state.json that short-circuits isFreshInstall().
 *
 * Mirrors the seeding logic in ui/e2e/_helpers/global-setup.ts. Two
 * scripts duplicating the same shape is a small evil; the alternative
 * (extracting into a shared module imported by both .mjs and .ts
 * entry points) has its own import-machinery weight.
 *
 * Inputs:
 *   - HERON_DATA_DIR -- where to write. Defaults to <repo>/data when unset.
 *
 * Outputs:
 *   - <dir>/auth.db with one owner-role user (id=u_e2e)
 *   - <dir>/profiles.json multi-profile registry
 *   - <dir>/users/u_e2e/profiles/default/{cv.md,profile.yml,portals.yml,_profile.md,applications.md}
 *   - <dir>/users/u_e2e/profiles/_shared/onboarding-state.json (completed: true)
 *   - <dir>/profiles/default/{...same five files}
 *   - <dir>/profiles/_shared/onboarding-state.json
 *
 * Why all the legacy paths: anonymous routes (the /login redirect
 * test) run through currentUserIdOrDefault() which returns
 * SYSTEM_USER_ID when there's no session, then file resolvers fall
 * back to data/profiles/. Per-user paths under data/users/u_e2e/
 * are read only AFTER a session lands. Lighthouse + Lost Pixel both
 * exercise the post-auth flow (via /api/auth/e2e-login), so the
 * per-user paths are the ones that matter; the legacy paths are
 * belt-and-braces for the pre-auth audits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const DATA_DIR = process.env.HERON_DATA_DIR
  ? path.resolve(process.env.HERON_DATA_DIR)
  : path.join(REPO_ROOT, 'data');

const TEST_USER_ID = 'u_e2e';
const TEST_USER_EMAIL = 'e2e@heron.test';
const TEST_USER_NAME = 'E2E + Lighthouse CI User';

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Per-user profile FS layout ────────────────────────────────────
const profileDir = path.join(DATA_DIR, 'users', TEST_USER_ID, 'profiles', 'default');
fs.mkdirSync(profileDir, { recursive: true });
const PROFILE_FILES = [
  ['cv.md', '# E2E Test User\n\nSenior Software Engineer · Test University · 2020-Present\n'],
  [
    'profile.yml',
    'name: E2E Test User\nemail: e2e@heron.test\ntargets:\n  - "Senior Software Engineer"\n',
  ],
  ['portals.yml', 'companies: []\nqueries: []\n'],
  ['_profile.md', '# E2E Test Profile\n\nMinimal profile fragment for tests.\n'],
  [
    'applications.md',
    [
      '# Applications Tracker',
      '',
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '',
    ].join('\n'),
  ],
];
for (const [name, content] of PROFILE_FILES) {
  fs.writeFileSync(path.join(profileDir, name), content, 'utf8');
}

// Per-user _shared with onboarding-state.json -- the shortest
// short-circuit in isFreshInstall().
const sharedDir = path.join(DATA_DIR, 'users', TEST_USER_ID, 'profiles', '_shared');
fs.mkdirSync(sharedDir, { recursive: true });
fs.writeFileSync(
  path.join(sharedDir, 'onboarding-state.json'),
  JSON.stringify({ completed: true, completedAt: Date.now() }, null, 2),
  'utf8',
);

// ── Legacy single-user paths (data/profiles/...) ─────────────────
// Read by anonymous (pre-auth) routes via SYSTEM_USER_ID fallback.
const legacyProfileDir = path.join(DATA_DIR, 'profiles', 'default');
fs.mkdirSync(legacyProfileDir, { recursive: true });
const legacySharedDir = path.join(DATA_DIR, 'profiles', '_shared');
fs.mkdirSync(legacySharedDir, { recursive: true });
for (const [name, content] of PROFILE_FILES) {
  fs.writeFileSync(path.join(legacyProfileDir, name), content, 'utf8');
}
fs.writeFileSync(
  path.join(legacySharedDir, 'onboarding-state.json'),
  JSON.stringify({ completed: true, completedAt: Date.now() }, null, 2),
  'utf8',
);

// ── profiles.json multi-profile registry ─────────────────────────
fs.writeFileSync(
  path.join(DATA_DIR, 'profiles.json'),
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

// ── auth.db seeding ──────────────────────────────────────────────
const authDbPath = path.join(DATA_DIR, 'auth.db');

// Locate better-sqlite3 in pnpm's content-addressed store. Scripts
// don't have their own package.json so plain `import 'better-sqlite3'`
// doesn't resolve.
const pnpmStore = path.join(REPO_ROOT, 'node_modules', '.pnpm');
const candidates = fs.existsSync(pnpmStore)
  ? fs
      .readdirSync(pnpmStore)
      .filter((n) => /^better-sqlite3@/.test(n))
      .map((n) => path.join(pnpmStore, n, 'node_modules', 'better-sqlite3', 'lib', 'index.js'))
      .filter((p) => fs.existsSync(p))
  : [];
if (candidates.length === 0) {
  console.error('::error::better-sqlite3 not found in node_modules/.pnpm/');
  process.exit(1);
}

const { default: Database } = await import(candidates[0]);
const db = new Database(authDbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT UNIQUE NOT NULL,
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
db.prepare(
  `INSERT OR REPLACE INTO users
   (id, email, email_verified, name, role, two_factor_enabled, created_at, updated_at)
   VALUES (?, ?, 1, ?, 'owner', 0, ?, ?)`,
).run(TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_NAME, now, now);

const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
console.log(`[seed-lighthouse-user] auth.db users count: ${n}`);
console.log(`[seed-lighthouse-user] data dir: ${DATA_DIR}`);
db.close();

if (n < 1) {
  console.error('::error::users count is 0 after insert. Seed broken.');
  process.exit(2);
}
