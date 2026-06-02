#!/usr/bin/env node
// Smoke test for pbxproj-version.mjs -- the pure pbxproj version-stamp rewrite.
//
// Hand-rolled (not vitest) so it runs in pre-commit / CI without booting the
// vitest workspace, matching the other scripts/native/*.test.mjs.
//
// The invariants under test:
//   - EVERY MARKETING_VERSION (quoted, bare, dotted) is rewritten to the
//     package.json semver;
//   - EVERY CURRENT_PROJECT_VERSION is bumped to the derived build number;
//   - the rewrite is idempotent (stamping an already-current body is a no-op);
//   - the build number is monotonic across releases AND deterministic;
//   - a non-semver version fails loud rather than stamping garbage.
import assert from 'node:assert/strict';
import { parseSemverCore, buildNumberFromSemver, stampPbxprojVersion } from './pbxproj-version.mjs';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

// A small pbxproj fixture covering the real shapes Xcode emits: bare dotted
// MARKETING_VERSION (1.0), the stale 0.1.0 app target, and CURRENT_PROJECT_VERSION = 1.
const FIXTURE = [
  '\t\t\tbuildSettings = {',
  '\t\t\t\tCURRENT_PROJECT_VERSION = 1;',
  '\t\t\t\tMARKETING_VERSION = 1.0;',
  '\t\t\t};',
  '\t\t\tbuildSettings = {',
  '\t\t\t\tCURRENT_PROJECT_VERSION = 1;',
  '\t\t\t\tMARKETING_VERSION = 0.1.0;',
  '\t\t\t};',
].join('\n');

t('parseSemverCore parses major/minor/patch, tolerating a leading v + suffix', () => {
  assert.deepEqual(parseSemverCore('1.4.2'), { major: 1, minor: 4, patch: 2 });
  assert.deepEqual(parseSemverCore('v2.0.13'), { major: 2, minor: 0, patch: 13 });
  assert.deepEqual(parseSemverCore('1.4.2-beta.1+sha'), { major: 1, minor: 4, patch: 2 });
  assert.equal(parseSemverCore('not-a-version'), null);
  assert.equal(parseSemverCore(''), null);
});

t('buildNumberFromSemver is monotonic + deterministic', () => {
  assert.equal(buildNumberFromSemver('1.4.2'), 10402);
  assert.equal(buildNumberFromSemver('1.4.1'), 10401);
  assert.equal(buildNumberFromSemver('0.1.0'), 100);
  // Monotonic across a real bump.
  assert.ok(buildNumberFromSemver('1.4.2') > buildNumberFromSemver('1.4.1'));
  assert.ok(buildNumberFromSemver('1.5.0') > buildNumberFromSemver('1.4.99'));
  // Deterministic: same input -> same output.
  assert.equal(buildNumberFromSemver('1.4.2'), buildNumberFromSemver('1.4.2'));
});

t('buildNumberFromSemver throws on a non-semver (fail loud)', () => {
  assert.throws(() => buildNumberFromSemver('garbage'), /not a semver/);
});

t('stampPbxprojVersion rewrites every MARKETING_VERSION to the package.json semver', () => {
  const out = stampPbxprojVersion(FIXTURE, '1.4.2');
  // Both targets -- the 1.0 AND the stale 0.1.0 -- become 1.4.2.
  const marketing = [...out.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(marketing, ['1.4.2', '1.4.2']);
  assert.ok(!out.includes('0.1.0'), 'stale 0.1.0 must be gone');
});

t('stampPbxprojVersion bumps every CURRENT_PROJECT_VERSION to the derived build number', () => {
  const out = stampPbxprojVersion(FIXTURE, '1.4.2');
  const builds = [...out.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(builds, ['10402', '10402']);
});

t('stampPbxprojVersion is idempotent (already-current body -> identical string)', () => {
  const once = stampPbxprojVersion(FIXTURE, '1.4.2');
  const twice = stampPbxprojVersion(once, '1.4.2');
  assert.equal(once, twice, 'a second stamp at the same version must be a no-op');
});

t('stampPbxprojVersion handles a quoted MARKETING_VERSION input', () => {
  const quoted = '\t\t\t\tMARKETING_VERSION = "1.0";\n\t\t\t\tCURRENT_PROJECT_VERSION = "1";';
  const out = stampPbxprojVersion(quoted, '2.0.0');
  assert.ok(out.includes('MARKETING_VERSION = 2.0.0;'));
  assert.ok(out.includes('CURRENT_PROJECT_VERSION = 20000;'));
});

t('stampPbxprojVersion drops a leading v from the marketing string', () => {
  const out = stampPbxprojVersion('MARKETING_VERSION = 1.0;', 'v3.2.1');
  assert.ok(out.includes('MARKETING_VERSION = 3.2.1;'));
});

t('stampPbxprojVersion throws on a non-semver version (fail loud)', () => {
  assert.throws(() => stampPbxprojVersion(FIXTURE, 'not-a-version'), /not a semver/);
});

console.log(`pbxproj-version: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
