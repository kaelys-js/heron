#!/usr/bin/env node
// Tests for select-release-to-promote.mjs -- the PURE core of the auto-promote
// step (which soaked beta cut, if any, to promote to production). Hand-rolled
// node:assert (no vitest) so it runs in pre-commit / CI standalone, matching the
// scripts/system convention.
//
// WHY this is the heart: the scheduled promote workflow must NEVER (a) promote a
// build that hasn't soaked, (b) promote one a maintainer put on hold, (c)
// re-promote (idempotency), or (d) regress production to an OLDER version. A bug
// here auto-ships the wrong thing to every store, so the decision is isolated +
// exhaustively tested.
import assert from 'node:assert/strict';
import { selectReleaseToPromote, semverGt } from './select-release-to-promote.mjs';

const DAY = 86_400_000;
const NOW = 1_780_000_000_000; // fixed clock
const ago = (days) => NOW - days * DAY;

// A beta cut = a normal vX.Y.Z release published to the beta tracks + marked
// GH-prerelease (channel, not a -beta semver suffix). So `version` is plain X.Y.Z.
const rel = (version, days, over = {}) => ({
  version,
  publishedAtMs: ago(days),
  isPrerelease: true,
  labels: [],
  ...over,
});

function run() {
  let pass = 0,
    fail = 0;
  const t = (name, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      fail++;
      console.error(`FAIL: ${name}\n  ${e.message}`);
    }
  };
  const pick = (releases, opts = {}) =>
    selectReleaseToPromote({
      releases,
      nowMs: NOW,
      soakDays: 3,
      promotedVersions: [],
      globalHold: false,
      ...opts,
    });

  t('semverGt compares X.Y.Z numerically (not lexically)', () => {
    assert.equal(semverGt('0.10.0', '0.9.0'), true); // 10 > 9 (lexical would fail)
    assert.equal(semverGt('1.0.0', '0.99.99'), true);
    assert.equal(semverGt('0.2.0', '0.2.0'), false);
    assert.equal(semverGt('0.2.1', '0.2.0'), true);
  });

  t('promotes a soaked, unpromoted, unheld beta', () => {
    const r = pick([rel('0.3.0', 5)]);
    assert.equal(r.version, '0.3.0');
  });

  t('skips a beta that is too fresh (within the soak window)', () => {
    const r = pick([rel('0.3.0', 1)]); // 1 day < 3-day soak
    assert.equal(r.version, null);
    assert.match(r.reason, /soak|fresh/i);
  });

  t('skips a beta labeled hold-promotion', () => {
    const r = pick([rel('0.3.0', 5, { labels: ['hold-promotion'] })]);
    assert.equal(r.version, null);
  });

  t('skips an already-promoted version (idempotency)', () => {
    const r = pick([rel('0.3.0', 5)], { promotedVersions: ['0.3.0'] });
    assert.equal(r.version, null);
  });

  t('global hold (open release-blocker) blocks everything', () => {
    const r = pick([rel('0.3.0', 5)], { globalHold: true });
    assert.equal(r.version, null);
    assert.match(r.reason, /block|hold/i);
  });

  t('picks the HIGHEST soaked candidate when several qualify', () => {
    const r = pick([rel('0.3.0', 6), rel('0.4.0', 4), rel('0.2.0', 9)]);
    assert.equal(r.version, '0.4.0');
  });

  t('does not promote a build still soaking even if an older one is ready', () => {
    // 0.4.0 cut yesterday (fresh) ; 0.3.0 cut 6d ago (soaked) -> promote 0.3.0,
    // 0.4.0 waits for its own soak on a later run.
    const r = pick([rel('0.4.0', 1), rel('0.3.0', 6)]);
    assert.equal(r.version, '0.3.0');
  });

  t('never regresses: candidate must exceed the max already-promoted version', () => {
    // prod already on 0.5.0; a soaked 0.4.0 beta lingers -> do NOT downgrade prod.
    const r = pick([rel('0.4.0', 9)], { promotedVersions: ['0.5.0'] });
    assert.equal(r.version, null);
  });

  t('non-prerelease entries are not candidates', () => {
    const r = pick([{ version: '0.3.0', publishedAtMs: ago(5), isPrerelease: false, labels: [] }]);
    assert.equal(r.version, null);
  });

  console.log(`\nselect-release-to-promote.test: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
