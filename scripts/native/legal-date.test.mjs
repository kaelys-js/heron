#!/usr/bin/env node
// Smoke test for legal-date.mjs -- the deterministic legal-page date.
//
// Hand-rolled (not vitest) so it runs in pre-commit / CI without booting the
// vitest workspace, matching the other scripts/*.test.mjs.
//
// The invariant under test: the resolver NEVER yields today's date, so the
// generated privacy/support/terms HTML stops churning daily.
import assert from 'node:assert/strict';
import { resolveLegalUpdated } from './legal-date.mjs';

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

t('a valid git short-date passes through', () => {
  assert.equal(resolveLegalUpdated('2026-05-28'), '2026-05-28');
});

t('trailing newline from git output is trimmed', () => {
  assert.equal(resolveLegalUpdated('2026-05-28\n'), '2026-05-28');
});

t('empty git output falls back (NOT today)', () => {
  const out = resolveLegalUpdated('');
  assert.equal(out, '2026-01-01');
  assert.notEqual(out, new Date().toISOString().slice(0, 10));
});

t('garbage falls back', () => {
  assert.equal(resolveLegalUpdated('not-a-date'), '2026-01-01');
  assert.equal(resolveLegalUpdated('2026/05/28'), '2026-01-01');
});

t('null/undefined fall back', () => {
  assert.equal(resolveLegalUpdated(null), '2026-01-01');
  assert.equal(resolveLegalUpdated(undefined), '2026-01-01');
});

t('a custom fallback is honored', () => {
  assert.equal(resolveLegalUpdated('', '2025-12-31'), '2025-12-31');
});

t('deterministic: same input -> same output, independent of today', () => {
  const a = resolveLegalUpdated('2020-01-01');
  const b = resolveLegalUpdated('2020-01-01');
  assert.equal(a, b);
  assert.equal(a, '2020-01-01');
});

console.log(`legal-date: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
