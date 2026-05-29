/** Asserts test runs cannot open the developer's real auth.db / app.db.
 *  Two guards: lib/server/db/index.ts routes to tmpdir when VITEST=true
 *  / NODE_ENV=test / HERON_DATA_DIR is set, and test-setup.ts sets
 *  HERON_DATA_DIR to a per-pid tmp path. Regression here would let
 *  Better Auth's first-user-becomes-owner hook stop firing for
 *  fresh-clone users. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('db/index.ts — DB paths are isolated during tests', () => {
  const dbSrc = fs.readFileSync(path.join(REPO_ROOT, 'ui/src/lib/server/db/index.ts'), 'utf8');

  it('reads HERON_DATA_DIR env override', () => {
    expect(dbSrc).toMatch(/process\.env\.HERON_DATA_DIR/);
  });

  it('reads HERON_AUTH_DB env override', () => {
    expect(dbSrc).toMatch(/process\.env\.HERON_AUTH_DB/);
  });

  it('reads HERON_APP_DB env override', () => {
    expect(dbSrc).toMatch(/process\.env\.HERON_APP_DB/);
  });

  it('auto-routes to tmpdir when VITEST=true', () => {
    expect(dbSrc).toMatch(/process\.env\.VITEST/);
    expect(dbSrc).toMatch(/os\.tmpdir\(\)/);
  });

  it('per-process tmpdir name uses BRAND-derived prefix + process.pid (parallel-worker safe)', () => {
    // db/index.ts:64 uses `${BRAND.name}-test-${process.pid}` so the
    // tmpdir prefix retargets on a brand rename rather than going stale.
    expect(dbSrc).toMatch(/\$\{BRAND\.name\}-test-\$\{process\.pid\}/);
  });
});

describe('test-setup.ts — DB env var is set BEFORE server imports', () => {
  const setup = fs.readFileSync(path.join(REPO_ROOT, 'ui/src/test-setup.ts'), 'utf8');

  it('sets HERON_DATA_DIR if missing', () => {
    expect(setup).toMatch(/process\.env\.HERON_DATA_DIR\s*=/);
  });

  it('env-var setup happens before any other import that could touch the DB', () => {
    // Find the line with `HERON_DATA_DIR =` and assert no
    // `from '$lib/server/...'` import sits above it.
    const lines = setup.split('\n');
    const setIdx = lines.findIndex((l) => /process\.env\.HERON_DATA_DIR\s*=/.test(l));
    expect(setIdx).toBeGreaterThan(-1);
    for (let i = 0; i < setIdx; i += 1) {
      const line = lines[i];
      expect(
        line,
        `line ${i + 1} imports a server module BEFORE the DB env-var override: ${line}`,
      ).not.toMatch(/from\s+['"]\$lib\/server\//);
      expect(
        line,
        `line ${i + 1} imports server/db BEFORE the DB env-var override: ${line}`,
      ).not.toMatch(/from\s+['"][^'"]*server\/db/);
    }
  });
});

describe('runtime check — current test process does NOT use repo data/', () => {
  it('hERON_DATA_DIR is set + points outside the repo', () => {
    const dataDir = process.env.HERON_DATA_DIR;
    expect(dataDir).toBeTruthy();
    // Must NOT be the repo's data/ dir
    expect(dataDir!.startsWith(REPO_ROOT)).toBe(false);
    // Must be under the OS tmpdir
    expect(dataDir!.startsWith(os.tmpdir())).toBe(true);
  });

  it('hERON_DATA_DIR exists on disk + is writable', () => {
    const dataDir = process.env.HERON_DATA_DIR!;
    expect(fs.existsSync(dataDir)).toBe(true);
    // Touch + remove a probe file
    const probe = path.join(dataDir, `.probe-${process.pid}`);
    fs.writeFileSync(probe, '');
    expect(fs.existsSync(probe)).toBe(true);
    fs.unlinkSync(probe);
  });
});

describe('docs — multi-user.integration test surfaces the isolation contract', () => {
  // Sanity: somewhere in the test suite, the isolation contract should
  // be referenced so anyone reading multi-user / profile tests knows
  // the DB they're seeing isn't real.
  it('db/index.ts documents the env-var override + test routing', () => {
    const dbSrc = fs.readFileSync(path.join(REPO_ROOT, 'ui/src/lib/server/db/index.ts'), 'utf8');
    expect(dbSrc).toMatch(/Test \/ fresh-clone safety/i);
    expect(dbSrc).toMatch(/ghost rows/i);
  });
});
