#!/usr/bin/env node
/**
 * seed-lighthouse-user -- insert a single owner row into auth.db so the
 * Lighthouse workflow can audit /login as the real login page (rather
 * than the /signup?first=1 redirect target).
 *
 * Why: ui/src/routes/login/+page.server.ts checks `users.count`. When
 * zero, it 302s to /signup?first=1. Lighthouse then audits signup,
 * which is intentionally `<meta name="robots" content="noindex">` AND
 * has a redirect chain -- both audits fail. Seeding one user makes
 * /login render as itself, and the audits clear.
 *
 * Safety: this script ONLY runs in CI (`process.env.CI === 'true'`).
 * The auth.db it writes to is the one `vite preview` will open at
 * `<repo>/data/auth.db` for the Lighthouse build. No effect on
 * developer machines unless the script is invoked manually.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

// Allow override; default to the repo-local data dir that vite preview
// reads when no HERON_DATA_DIR is set.
const DATA_DIR = process.env.HERON_DATA_DIR
  ? path.resolve(process.env.HERON_DATA_DIR)
  : path.join(REPO_ROOT, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const authDbPath = path.join(DATA_DIR, 'auth.db');

// Locate the locally-installed better-sqlite3. pnpm's .pnpm store
// has the binary; bare `import 'better-sqlite3'` doesn't resolve from
// scripts/ because there's no package.json hoist for this directory.
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

// Schema mirrors ui/src/lib/server/db/auth-schema.ts::users + the DDL in
// ui/src/lib/server/db/migrate.ts::AUTH_DDL. Created with IF NOT EXISTS
// so vite preview's own ensureSchema() at boot is a no-op.
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
`);

const now = Date.now();
db.prepare(
  `INSERT OR REPLACE INTO users
   (id, email, email_verified, name, role, two_factor_enabled, created_at, updated_at)
   VALUES (?, ?, 1, ?, 'owner', 0, ?, ?)`,
).run('u_lighthouse', 'lighthouse@heron.test', 'Lighthouse CI User', now, now);

const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
console.log(`[seed-lighthouse-user] auth.db users count: ${n}`);
db.close();

if (n < 1) {
  console.error('::error::users count is 0 after insert. Seed broken.');
  process.exit(2);
}
