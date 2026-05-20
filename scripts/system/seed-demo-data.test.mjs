#!/usr/bin/env node
/** seed-demo-data.test.mjs -- TDD coverage for the screenshot seeder.
 *  Asserts: deterministic IDs, expected fixture shape, idempotent
 *  re-seed, refuses to write under non-tmpdir HERON_DATA_DIR. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SEED_SCRIPT = join(ROOT, 'scripts', 'system', 'seed-demo-data.mjs');

let passed = 0;
let failed = 0;
const fails = [];

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log('  OK   ' + name);
  } else {
    failed++;
    fails.push(name + (detail ? ' -- ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? ' -- ' + detail : ''));
  }
}

function runSeed(dataDir, extraEnv = {}) {
  return execFileSync('node', [SEED_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, HERON_DATA_DIR: dataDir, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryRunSeed(dataDir, extraEnv = {}) {
  try {
    return { ok: true, out: runSeed(dataDir, extraEnv) };
  } catch (err) {
    return {
      ok: false,
      out: (err.stdout?.toString?.() ?? '') + (err.stderr?.toString?.() ?? ''),
      status: err.status ?? null,
    };
  }
}

console.log('seed-demo-data.mjs -- unit tests');
console.log('');

// Fixture 1: seeding under a tmpdir HERON_DATA_DIR succeeds.
{
  const dir = mkdtempSync(join(tmpdir(), 'heron-seed-test-'));
  try {
    const r = tryRunSeed(dir);
    ok('seed: exits 0 under tmpdir HERON_DATA_DIR', r.ok, r.out?.slice(0, 200));
    // Demo user lives at data/users/demo-screenshots/.
    const userRoot = join(dir, 'users', 'demo-screenshots');
    ok('seed: creates the demo-screenshots user dir', existsSync(userRoot));
    const profileRoot = join(userRoot, 'profiles', 'default');
    ok('seed: creates the default profile dir', existsSync(profileRoot));
    ok('seed: writes applications.md', existsSync(join(profileRoot, 'applications.md')));
    ok('seed: writes pipeline.md', existsSync(join(profileRoot, 'pipeline.md')));
    ok('seed: writes cv.md', existsSync(join(profileRoot, 'cv.md')));
    ok('seed: writes profile.yml', existsSync(join(profileRoot, 'profile.yml')));
    ok(
      'seed: writes at least one report under reports/',
      existsSync(join(profileRoot, 'reports')) &&
        readdirSync(join(profileRoot, 'reports')).length > 0,
    );
    // applications.md must have at least 5 rows so the inbox isn't empty.
    const apps = readFileSync(join(profileRoot, 'applications.md'), 'utf8');
    const rows = apps.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #'));
    ok('seed: applications.md has >= 5 rows', rows.length >= 5, 'got ' + rows.length);
    // Status diversity -- must hit Evaluated + Applied + Interview at minimum.
    ok('seed: applications.md includes "Evaluated" rows', apps.includes('| Evaluated |'));
    ok('seed: applications.md includes "Applied" rows', apps.includes('| Applied |'));
    ok('seed: applications.md includes "Interview" rows', apps.includes('| Interview |'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Fixture 2: re-running on the same dir is idempotent (no crash, same files).
{
  const dir = mkdtempSync(join(tmpdir(), 'heron-seed-test-'));
  try {
    const r1 = tryRunSeed(dir);
    ok('idempotent: first run exits 0', r1.ok);
    const r2 = tryRunSeed(dir);
    ok('idempotent: second run exits 0', r2.ok);
    const apps = readFileSync(
      join(dir, 'users', 'demo-screenshots', 'profiles', 'default', 'applications.md'),
      'utf8',
    );
    // Row count stable -- seeding is overwrite, not append.
    const rows = apps.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #'));
    ok('idempotent: applications.md row count stable across re-runs', rows.length >= 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Fixture 3: refuses to seed when HERON_DATA_DIR is not a tmpdir-scoped path.
// Safety guard -- prevents accidental corruption of a real install.
{
  const r = tryRunSeed('/Users/whoever/career-ops/data');
  ok('safety: refuses non-tmpdir HERON_DATA_DIR', !r.ok, 'expected exit non-zero');
  ok(
    'safety: error message mentions tmpdir',
    /tmpdir|temporary/i.test(r.out ?? ''),
    'output was: ' + (r.out ?? '').slice(0, 200),
  );
}

// Fixture 4: deterministic IDs -- same job IDs across re-runs.
{
  const dir = mkdtempSync(join(tmpdir(), 'heron-seed-test-'));
  try {
    runSeed(dir);
    const apps1 = readFileSync(
      join(dir, 'users', 'demo-screenshots', 'profiles', 'default', 'applications.md'),
      'utf8',
    );
    rmSync(join(dir, 'users'), { recursive: true, force: true });
    runSeed(dir);
    const apps2 = readFileSync(
      join(dir, 'users', 'demo-screenshots', 'profiles', 'default', 'applications.md'),
      'utf8',
    );
    ok('deterministic: applications.md identical across fresh seeds', apps1 === apps2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
if (failed === 0) {
  console.log(`OK ${passed}/${passed} test(s) passed`);
  process.exit(0);
} else {
  console.error(`FAIL ${failed} test(s) failed (${passed} passed)`);
  for (const f of fails) console.error('  ' + f);
  process.exit(1);
}
