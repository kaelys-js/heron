#!/usr/bin/env node
// Hand-rolled tests for logger.mjs (node:assert, not vitest) so they run
// in pre-commit / CI without booting the vitest workspace, matching the
// other scripts/*.test.mjs.
//
// Invariants under test (the WHY, not just the WHAT):
//
//   - Overlapping CI runs must be disambiguable. A push and a scheduled
//     sweep can interleave in shared log views; every CI annotation
//     therefore carries `[run <GITHUB_RUN_ID>]`. The prefix MUST appear
//     when the id is set and MUST be absent when it isn't (local /
//     pre-runid Actions).
//
//   - Annotations must not break on multiline / punctuated messages. An
//     unescaped newline truncates a GitHub annotation; an unescaped `,`
//     or `:` in a property value corrupts the property parse. So the
//     escaping is load-bearing, not cosmetic.
//
//   - Local runs (no GITHUB_ACTIONS) must stay readable: plain
//     `level: msg`, no `::` noise, no run prefix.
import assert from 'node:assert/strict';
import { formatAnnotation } from './logger.mjs';

const CI = { GITHUB_ACTIONS: 'true' };
const CI_RUN = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '42' };
const LOCAL = {};

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

// ── CI annotation shape ──
t('CI error -> ::error:: annotation', () => {
  assert.equal(formatAnnotation('error', 'boom', {}, CI), '::error::boom');
});

t('CI warning -> ::warning:: annotation', () => {
  assert.equal(formatAnnotation('warning', 'heads up', {}, CI), '::warning::heads up');
});

t('CI notice -> ::notice:: annotation', () => {
  assert.equal(formatAnnotation('notice', 'fyi', {}, CI), '::notice::fyi');
});

// ── run-id prefix (overlapping-run disambiguation) ──
t('GITHUB_RUN_ID set -> message prefixed with [run <id>]', () => {
  assert.equal(formatAnnotation('error', 'boom', {}, CI_RUN), '::error::[run 42] boom');
});

t('GITHUB_RUN_ID unset -> no run prefix', () => {
  const out = formatAnnotation('error', 'boom', {}, CI);
  assert.equal(out, '::error::boom');
  assert.ok(!out.includes('[run'), 'must not invent a run prefix when id is absent');
});

t('run prefix is itself escaped together with the message', () => {
  // The whole prefixed string passes through data-escaping, so a newline
  // in the message is still encoded even with the prefix present.
  assert.equal(formatAnnotation('error', 'a\nb', {}, CI_RUN), '::error::[run 42] a%0Ab');
});

// ── data escaping (multiline + percent) ──
t('newlines are escaped (%0A) -- otherwise annotation truncates', () => {
  assert.equal(formatAnnotation('error', 'line1\nline2', {}, CI), '::error::line1%0Aline2');
});

t('carriage return escaped (%0D)', () => {
  assert.equal(formatAnnotation('error', 'a\rb', {}, CI), '::error::a%0Db');
});

t('percent escaped first (%25), not double-escaped', () => {
  // A literal "%0A" in the message must become "%250A", not "%0A".
  assert.equal(formatAnnotation('error', '50% %0A', {}, CI), '::error::50%25 %250A');
});

t('commas/colons in the DATA section are left intact', () => {
  // Only property VALUES need ,/: escaped; the data body does not.
  assert.equal(formatAnnotation('error', 'a, b: c', {}, CI), '::error::a, b: c');
});

// ── property formatting + escaping ──
t('file/line properties are emitted in order', () => {
  assert.equal(
    formatAnnotation('error', 'msg', { file: 'scripts/x.mjs', line: 12 }, CI),
    '::error file=scripts/x.mjs,line=12::msg',
  );
});

t('file only (no line) still well-formed', () => {
  assert.equal(
    formatAnnotation('warning', 'msg', { file: 'a/b.mjs' }, CI),
    '::warning file=a/b.mjs::msg',
  );
});

t('col property supported', () => {
  assert.equal(
    formatAnnotation('error', 'msg', { file: 'a.mjs', line: 1, col: 5 }, CI),
    '::error file=a.mjs,line=1,col=5::msg',
  );
});

t('comma/colon in a property value are escaped (%2C/%3A)', () => {
  // A path with a drive-letter colon or a comma must not break the
  // property list delimiter or the command terminator.
  assert.equal(
    formatAnnotation('error', 'msg', { file: 'C:weird,name.mjs' }, CI),
    '::error file=C%3Aweird%2Cname.mjs::msg',
  );
});

t('line=0 is still emitted (uses != null, not falsy check)', () => {
  assert.equal(
    formatAnnotation('error', 'msg', { file: 'a.mjs', line: 0 }, CI),
    '::error file=a.mjs,line=0::msg',
  );
});

// ── local branch ──
t('local (no GITHUB_ACTIONS) -> plain prefixed, no annotation', () => {
  assert.equal(formatAnnotation('error', 'boom', {}, LOCAL), 'error: boom');
});

t('local warning/notice plain', () => {
  assert.equal(formatAnnotation('warning', 'w', {}, LOCAL), 'warning: w');
  assert.equal(formatAnnotation('notice', 'n', {}, LOCAL), 'notice: n');
});

t('local: no run prefix even if GITHUB_RUN_ID leaks into env', () => {
  // Without GITHUB_ACTIONS we are not in a runner; a stray run id must
  // not turn local output into annotation/prefixed form.
  assert.equal(formatAnnotation('error', 'boom', {}, { GITHUB_RUN_ID: '42' }), 'error: boom');
});

t('local: properties and multiline left raw (human-readable)', () => {
  assert.equal(formatAnnotation('error', 'a\nb', { file: 'x.mjs', line: 1 }, LOCAL), 'error: a\nb');
});

console.log(`logger: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
