#!/usr/bin/env node
/**
 * Unit tests for verify-no-personal-identity.mjs.
 *
 * The guard blocks a personal email / legal name from landing in a
 * commit's author, committer, or sign-off identity. The denylist is
 * stored as SHA-256 hashes (never plaintext) so the public repo can't
 * re-leak the very PII we're scrubbing -- which means these tests use
 * SYNTHETIC denied values (a fake email + fake name we hash locally)
 * to exercise the detection logic, plus assertions that the REAL
 * denylist is populated and does NOT over-block the allowed identities.
 *
 * Run: node scripts/system/verify-no-personal-identity.test.mjs
 *
 * No test framework -- plain Node + assert + exit-code-on-fail, matching
 * verify-no-deflection.test.mjs / verify-comment-style.test.mjs.
 */
import assert from 'node:assert/strict';
import {
  DENIED_HASHES,
  normalizeToken,
  hashToken,
  isDeniedToken,
  extractEmails,
  extractTrailerIdentities,
  scanIdentity,
  scanMessage,
  scanCommit,
} from './verify-no-personal-identity.mjs';

let passed = 0;
let failed = 0;
function ok(name, fn) {
  try {
    fn();
    console.log(`  OK  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`    ${err.message}`);
    failed += 1;
  }
}

console.log('verify-no-personal-identity.mjs -- unit tests\n');

// Synthetic denylist -- fake PII we control, so no real personal data
// lives in this tracked file.
const SYNTH_EMAIL = 'denied@example.test';
const SYNTH_NAME = 'Test Denied';
const SYNTH = new Set([hashToken(SYNTH_EMAIL), hashToken(SYNTH_NAME)]);

// ── normalizeToken ──────────────────────────────────────────────────
ok('normalizeToken lowercases + trims', () => {
  assert.equal(normalizeToken('  Foo.Bar@ICLOUD.com '), 'foo.bar@icloud.com');
  assert.equal(normalizeToken('Test Denied'), 'test denied');
});

ok('hashToken is stable + normalization-insensitive', () => {
  assert.equal(hashToken('DENIED@example.test'), hashToken('  denied@example.test '));
  assert.equal(hashToken(SYNTH_EMAIL).length, 64); // sha256 hex
});

// ── isDeniedToken (against synthetic set) ───────────────────────────
ok('isDeniedToken: synthetic email matches', () => {
  assert.equal(isDeniedToken(SYNTH_EMAIL, SYNTH), true);
  assert.equal(isDeniedToken('DENIED@EXAMPLE.TEST', SYNTH), true); // case-insensitive
});
ok('isDeniedToken: unknown token does not match', () => {
  assert.equal(isDeniedToken('someone@example.test', SYNTH), false);
});

// ── extractEmails ───────────────────────────────────────────────────
ok('extractEmails finds plain + plus-addressed emails', () => {
  const emails = extractEmails('reach a@b.io or 41795364+kaelys-js@users.noreply.github.com today');
  assert.deepEqual(emails, ['a@b.io', '41795364+kaelys-js@users.noreply.github.com']);
});
ok('extractEmails returns [] when none present', () => {
  assert.deepEqual(extractEmails('no addresses here'), []);
});

// ── extractTrailerIdentities ────────────────────────────────────────
ok('extractTrailerIdentities parses Signed-off-by + Co-authored-by', () => {
  const msg = [
    'feat: thing',
    '',
    'Signed-off-by: Test Denied <denied@example.test>',
    'Co-authored-by: kaelys-js <hello@heron.app>',
  ].join('\n');
  const ids = extractTrailerIdentities(msg);
  assert.deepEqual(ids, [
    { name: 'Test Denied', email: 'denied@example.test' },
    { name: 'kaelys-js', email: 'hello@heron.app' },
  ]);
});
ok('extractTrailerIdentities ignores non-trailer lines', () => {
  assert.deepEqual(extractTrailerIdentities('Just prose mentioning Foo <foo@bar.io>'), []);
});

// ── scanIdentity (author/committer) ─────────────────────────────────
ok('scanIdentity flags denied name AND email', () => {
  const hits = scanIdentity(SYNTH_NAME, SYNTH_EMAIL, SYNTH);
  const fields = hits.map((h) => h.field).sort();
  assert.deepEqual(fields, ['email', 'name']);
});
ok('scanIdentity passes a clean identity', () => {
  assert.equal(scanIdentity('kaelys-js', 'hello@heron.app', SYNTH).length, 0);
  assert.equal(
    scanIdentity('kaelys-js', '41795364+kaelys-js@users.noreply.github.com', SYNTH).length,
    0,
  );
});

// ── scanMessage ─────────────────────────────────────────────────────
ok('scanMessage flags a denied email anywhere in the body', () => {
  const hits = scanMessage('please contact denied@example.test for details', SYNTH);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].field, 'message-email');
});
ok('scanMessage flags a denied name only inside a sign-off trailer', () => {
  const hits = scanMessage('chore: x\n\nSigned-off-by: Test Denied <ok@example.test>', SYNTH);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].field, 'signoff-name');
});
ok('scanMessage does NOT flag a denied name in plain prose', () => {
  // Names are only checked inside trailers, to avoid prose false-positives.
  assert.equal(scanMessage('Test Denied authored the original patch', SYNTH).length, 0);
});
ok('scanMessage passes a clean signed-off message', () => {
  const msg = 'fix: y\n\nSigned-off-by: kaelys-js <41795364+kaelys-js@users.noreply.github.com>';
  assert.equal(scanMessage(msg, SYNTH).length, 0);
});

// ── scanCommit (author + committer + message combined) ──────────────
ok('scanCommit labels author/committer/message fields', () => {
  const hits = scanCommit(
    {
      sha: 'deadbeef',
      authorName: 'kaelys-js',
      authorEmail: SYNTH_EMAIL,
      committerName: 'kaelys-js',
      committerEmail: 'hello@heron.app',
      message: 'feat: z\n\nSigned-off-by: Test Denied <denied@example.test>',
    },
    SYNTH,
  );
  const fields = hits.map((h) => h.field).sort();
  // author email denied; message has denied email + denied sign-off name.
  assert.deepEqual(fields, ['author-email', 'message-email', 'signoff-name']);
});
ok('scanCommit passes a fully clean commit', () => {
  const hits = scanCommit(
    {
      sha: 'cafe',
      authorName: 'Cole B',
      authorEmail: '41795364+kaelys-js@users.noreply.github.com',
      committerName: 'kaelys-js',
      committerEmail: '41795364+kaelys-js@users.noreply.github.com',
      message: 'docs: w\n\nSigned-off-by: kaelys-js <41795364+kaelys-js@users.noreply.github.com>',
    },
    SYNTH,
  );
  assert.equal(hits.length, 0);
});

// ── REAL denylist: populated, and allowed identities are NOT blocked ─
ok('real DENIED_HASHES is populated (>= 3 entries)', () => {
  assert.ok(DENIED_HASHES.size >= 3, `expected >=3, got ${DENIED_HASHES.size}`);
});
ok('real denylist does NOT block the allowed identities', () => {
  // Kept identities (email-only scrub): the GitHub no-reply, the project
  // email, the global no-reply, and the short display name "Cole B".
  for (const allowed of [
    '41795364+kaelys-js@users.noreply.github.com',
    'hello@heron.app',
    'no-reply@resistjs.dev',
    'kaelys-js',
    'Cole B',
  ]) {
    assert.equal(isDeniedToken(allowed), false, `must allow: ${allowed}`);
  }
});

// ── Final report ────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? 'OK' : 'FAIL'} ${passed}/${passed + failed} test(s) passed`);
process.exit(failed === 0 ? 0 : 1);
