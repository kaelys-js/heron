/**
 * E2E test helper — seed an ephemeral SQLite + profile tree.
 *
 * Each test calls `seedFreshInstall()` in its `beforeAll` (or beforeEach
 * for stronger isolation). The helper:
 *
 *   1. Writes a tmpdir DATA_DIR
 *   2. Creates auth.db + app.db with the canonical schema
 *   3. Inserts a default user (id=u_e2e, role=owner)
 *   4. Creates a single 'default' profile under
 *      data/users/u_e2e/profiles/default/
 *   5. Drops in a minimal cv.md + profile.yml so /onboarding doesn't
 *      bounce the user back
 *   6. Returns { dataDir, user, signInUrl }
 *
 * The test then sets the DATA_DIR env var BEFORE booting the preview
 * server. The preview server reads that env var and routes all reads/
 * writes there, leaving the developer's real data/* untouched.
 *
 * Why a TypeScript helper (not a fixtures.json): the schema evolves
 * fast in this phase; keeping the seed code aligned with the live
 * schema via direct imports beats maintaining a fixture file.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type SeededInstall = {
  /** tmpdir absolute path. Set DATA_DIR=this for the preview server. */
  dataDir: string;
  /** Test user — same email + id every run for deterministic asserts. */
  user: { id: string; email: string; name: string };
  /** Profile slug used in the test. */
  profileSlug: string;
};

const TEST_USER_ID = 'u_e2e';
const TEST_USER_EMAIL = 'e2e@heron.test';

export function seedFreshInstall(): SeededInstall {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heron-e2e-'));
  // Per-user profile dir
  const profileDir = path.join(dataDir, 'users', TEST_USER_ID, 'profiles', 'default');
  fs.mkdirSync(profileDir, { recursive: true });

  // Minimal CV
  fs.writeFileSync(
    path.join(profileDir, 'cv.md'),
    '# E2E Test User\n\nSenior Software Engineer · Test University · 2020-Present',
    'utf8',
  );
  // Minimal profile.yml
  fs.writeFileSync(
    path.join(profileDir, 'profile.yml'),
    'name: E2E Test User\nemail: e2e@heron.test\ntargets:\n  - "Senior Software Engineer"\n',
    'utf8',
  );
  // Empty applications.md (header only)
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

  return {
    dataDir,
    user: { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'E2E Test User' },
    profileSlug: 'default',
  };
}

/** Tear down the dataDir created by seedFreshInstall. */
export function teardown(install: SeededInstall): void {
  try {
    fs.rmSync(install.dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}
