#!/usr/bin/env node
// Smoke test for gen-build-info.mjs's pure helpers -- the CHANGELOG-top-section
// parser + the commit/channel fallbacks.
//
// Hand-rolled (not vitest) so it runs in pre-commit / CI without booting the
// vitest workspace, matching the other scripts/*.test.mjs.
//
// WHY these invariants matter: build-info.ts feeds the About "What's New" + the
// auto-update card. If topChangelogSection bled the next version's notes (or the
// `# Changelog` preamble) into the top section, every release would show the
// wrong notes. The commit/channel fallbacks must keep a local `pnpm electron:pack`
// (no GITHUB_SHA, git present) and a release tarball (no git) both building.
import assert from 'node:assert/strict';
import { topChangelogSection, resolveChannel, resolveCommit } from './gen-build-info.mjs';

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

const CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] \u2014 2026-06-01

### Added
- A new thing.
- Another thing.

## [1.1.0] \u2014 2026-05-01

### Fixed
- An old thing.
`;

t('returns ONLY the top version section (not the next one, not the preamble)', () => {
  const top = topChangelogSection(CHANGELOG);
  assert.ok(top.startsWith('## [1.2.0]'), 'starts at the first ## heading');
  assert.ok(top.includes('A new thing.'), 'includes the top section body');
  assert.ok(!top.includes('1.1.0'), 'must NOT bleed into the next version');
  assert.ok(!top.includes('All notable changes'), 'must NOT include the preamble');
});

t('trims surrounding whitespace', () => {
  const top = topChangelogSection(CHANGELOG);
  assert.equal(top, top.trim());
  assert.ok(!top.endsWith('\n'));
});

t('single-section changelog returns the whole section', () => {
  const one = `# Changelog\n\nblurb\n\n## [0.1.0] \u2014 2026-05-15\n\nInitial release.\n`;
  const top = topChangelogSection(one);
  assert.ok(top.startsWith('## [0.1.0]'));
  assert.ok(top.includes('Initial release.'));
});

t('no version section -> empty string', () => {
  assert.equal(topChangelogSection('# Changelog\n\njust a preamble, no releases'), '');
  assert.equal(topChangelogSection(''), '');
  assert.equal(topChangelogSection(null), '');
  assert.equal(topChangelogSection(undefined), '');
});

t('an H3 inside a section does NOT split it (only ## ends a section)', () => {
  const top = topChangelogSection(CHANGELOG);
  assert.ok(top.includes('### Added'), 'sub-headings stay inside the section');
});

t('channel: explicit HERON_RELEASE_CHANNEL always wins', () => {
  assert.equal(
    resolveChannel({ HERON_RELEASE_CHANNEL: 'nightly', EP_PRE_RELEASE: 'true' }),
    'nightly',
  );
});

t('channel: EP_PRE_RELEASE -> beta, else stable', () => {
  assert.equal(resolveChannel({ EP_PRE_RELEASE: 'true' }), 'beta');
  assert.equal(resolveChannel({}), 'stable');
  assert.equal(
    resolveChannel({ HERON_RELEASE_CHANNEL: '  ' }),
    'stable',
    'blank override is ignored',
  );
});

t('commit: GITHUB_SHA wins, sliced to 7', () => {
  assert.equal(
    resolveCommit({ GITHUB_SHA: 'abcdef1234567890' }, () => 'zzzzzzz'),
    'abcdef1',
  );
});

t('commit: falls back to git short, then to dev', () => {
  assert.equal(
    resolveCommit({}, () => 'deadbee'),
    'deadbee',
    'git short used when no GITHUB_SHA',
  );
  assert.equal(
    resolveCommit({}, () => ''),
    'dev',
    'empty git output -> dev',
  );
  assert.equal(
    resolveCommit({}, () => {
      throw new Error('not a git repo');
    }),
    'dev',
    'git throwing -> dev',
  );
});

console.log(`gen-build-info: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
