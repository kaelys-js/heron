#!/usr/bin/env node
/**
 * verify-versions.mjs — keep `.mise.toml` and every `package.json`'s
 * `engines` block in sync.
 *
 * One source of truth: `.mise.toml`. Every place that pins Node, pnpm,
 * or Ruby (engines fields, packageManager field, CI workflow `mise-action`
 * inputs) must match the .mise.toml value EXACTLY — not a range, not a
 * caret, not a tilde. Drift between these is what causes:
 *
 *   • Native-binding ABI mismatches (better-sqlite3 fails to load
 *     because mise installed Node 26 but the system PATH points at
 *     Node 25 from an earlier session)
 *   • CI green / local red because CI used the .mise.toml version but
 *     a developer's shell is on something older
 *   • "Unsupported engine" pnpm warnings on every build, which the
 *     user has to read past + risks ignoring
 *
 * The verifier:
 *   1. Reads `.mise.toml` → extracts node, pnpm, ruby versions.
 *   2. Reads each package.json's `engines.node` + `engines.pnpm` —
 *      asserts they're EXACTLY `=={version}` (pnpm syntax for exact pin).
 *   3. Reads root package.json's `packageManager` — asserts it equals
 *      `pnpm@{pnpm-version}`.
 *   4. Reads the currently-active Node + pnpm via `node --version` /
 *      `pnpm --version` — warns (doesn't fail) when they don't match
 *      .mise.toml. Most likely cause: mise activation isn't sourced in
 *      the user's shell.
 *
 * Exit codes:
 *   0 — every pin matches .mise.toml
 *   1 — at least one drift
 *   2 — env / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const N = '\x1b[0m';

const checks = [];
const pass = (name, evidence = '') => checks.push({ status: 'pass', name, evidence });
const fail = (name, evidence = '') => checks.push({ status: 'fail', name, evidence });
const warn = (name, evidence = '') => checks.push({ status: 'warn', name, evidence });

// ── 1. Parse .mise.toml ──────────────────────────────────────────────
const miseTomlPath = resolve(ROOT, '.mise.toml');
if (!existsSync(miseTomlPath)) {
  console.error('No .mise.toml at repo root — version pinning has no source of truth.');
  process.exit(2);
}
const miseToml = readFileSync(miseTomlPath, 'utf8');
function pin(tool) {
  const m = miseToml.match(new RegExp('^' + tool + '\\s*=\\s*"([^"]+)"', 'm'));
  return m ? m[1] : null;
}
const pinned = {
  node: pin('node'),
  pnpm: pin('pnpm'),
  ruby: pin('ruby'),
};
if (!pinned.node || !pinned.pnpm) {
  console.error('.mise.toml missing node or pnpm pin');
  process.exit(2);
}
pass('mise.toml node=' + pinned.node);
pass('mise.toml pnpm=' + pinned.pnpm);

// ── 2. Check package.json engines fields ─────────────────────────────
const PKG_PATHS = ['package.json', 'ui/package.json', 'ui/electron/package.json'];

function readPkg(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

for (const rel of PKG_PATHS) {
  const pkg = readPkg(rel);
  if (!pkg) {
    fail(rel + ' missing or invalid JSON');
    continue;
  }
  const engines = pkg.engines ?? {};
  if (engines.node !== pinned.node) {
    fail(
      rel + ' engines.node',
      'expected exact "' + pinned.node + '", got "' + (engines.node ?? '(unset)') + '"',
    );
  } else {
    pass(rel + ' engines.node = ' + pinned.node);
  }
  if (engines.pnpm !== pinned.pnpm) {
    fail(
      rel + ' engines.pnpm',
      'expected exact "' + pinned.pnpm + '", got "' + (engines.pnpm ?? '(unset)') + '"',
    );
  } else {
    pass(rel + ' engines.pnpm = ' + pinned.pnpm);
  }
}

// ── 3. packageManager field on root ──────────────────────────────────
const rootPkg = readPkg('package.json');
const expectedPM = 'pnpm@' + pinned.pnpm;
if (rootPkg?.packageManager !== expectedPM) {
  fail(
    'root packageManager',
    'expected "' + expectedPM + '", got "' + (rootPkg?.packageManager ?? '(unset)') + '"',
  );
} else {
  pass('root packageManager = ' + expectedPM);
}

// ── 4. Active runtime versions (warn-only) ───────────────────────────
function active(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .replace(/^v/, '');
  } catch {
    return null;
  }
}
const activeNode = active('node --version');
const activePnpm = active('pnpm --version');
if (activeNode && activeNode !== pinned.node) {
  warn(
    'active node',
    'shell is on v' +
      activeNode +
      ' but .mise.toml pins ' +
      pinned.node +
      ' — run `eval "$(mise activate zsh)"` (or your shell) + `cd .` to apply',
  );
} else if (activeNode) {
  pass('active node = ' + activeNode);
}
if (activePnpm && activePnpm !== pinned.pnpm) {
  warn(
    'active pnpm',
    'shell is on ' +
      activePnpm +
      ' but .mise.toml pins ' +
      pinned.pnpm +
      ' — same fix (mise activate + cd .)',
  );
} else if (activePnpm) {
  pass('active pnpm = ' + activePnpm);
}

// ── Summary ──────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.status === 'pass').length;
const failed = checks.filter((c) => c.status === 'fail').length;
const warned = checks.filter((c) => c.status === 'warn').length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ passed, failed, warned, checks, pinned }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

console.log();
console.log(B + 'verify-versions' + N + '  ' + DIM + miseTomlPath + N);
console.log();
for (const c of checks) {
  const tag = c.status === 'pass' ? G + '✓' + N : c.status === 'warn' ? Y + '!' + N : R + '✗' + N;
  console.log('  ' + tag + ' ' + c.name + (c.evidence ? '  ' + DIM + c.evidence + N : ''));
}
console.log();
const ok = failed === 0;
console.log(
  B +
    'Result' +
    N +
    '  ' +
    (ok ? G : R) +
    passed +
    '/' +
    checks.length +
    ' pinned' +
    N +
    (warned ? '  ' + Y + warned + ' shell drift warning(s)' + N : '') +
    (failed ? '  ' + R + failed + ' failed' + N : ''),
);
process.exit(ok ? 0 : 1);
