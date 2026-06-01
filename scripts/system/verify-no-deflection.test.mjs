#!/usr/bin/env node
/**
 * Unit tests for verify-no-deflection.mjs.
 *
 * Tests the regex + bypass-token logic against ~20 fixtures lifted
 * from the PR-100 deflection inventory + clean counter-examples.
 *
 * Run: node scripts/system/verify-no-deflection.test.mjs
 *
 * No test framework -- plain Node + assert + exit-code-on-fail.
 * Matches the style of scripts/system/verify-comment-style.test.mjs
 * and verify-english-only.test.mjs.
 */
import assert from 'node:assert/strict';
import { DEFLECTION_REGEX, BYPASS_TOKEN, scanBody, isExemptPath } from './verify-no-deflection.mjs';

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

console.log('verify-no-deflection.mjs -- unit tests\n');

// ── Regex positive cases (must trigger) ─────────────────────────────

const POSITIVE = [
  // From the PR-100 deflection inventory:
  'Mark as a follow-up since the API is unfamiliar',
  '// MVP for now -- expand later',
  'This is out of scope for the current PR',
  'Skip this case for now, address in a future PR',
  '// punt the auth-gated routes to a separate ticket',
  '/* Simplify to public routes only for the MVP integration. */',
  'These need to be deferred until kotlinx-coroutines-test lands',
  'Defer to a follow-up',
  '## Out-of-scope (intentionally)',
  'won’t fit in this PR', // curly-quote variant
  "won't fit in this PR", // straight-quote variant
  'future work: re-record baselines',
  'leave for now',
  'separate PR will handle the rest',
];

for (const sample of POSITIVE) {
  ok(`positive: "${sample.slice(0, 60)}"`, () => {
    assert.ok(DEFLECTION_REGEX.test(sample), `regex must match: ${sample}`);
  });
}

// ── Regex negative cases (must NOT trigger) ─────────────────────────

const NEGATIVE = [
  // Substring "defer" inside an unrelated technical word -- our regex
  // uses word-boundaries, so `referer`, `defertype`, etc. don't fire.
  'The Referer header is missing',
  'config.deferred_load_strategy', // word-bounded "deferred" -- actually this SHOULD match
  // ^ revisit: substring-vs-word-bounded matters. drop this case.
  // The bypass token immunises:
  `Comment about MVP scope ${BYPASS_TOKEN}`,
  // Innocent prose without any trigger:
  'Fix the BridgeViewController XCTUnwrap conditional-binding bug.',
  'Verified: swiftlint --strict exits 0.',
  // Words that LOOK suspicious but aren't in the regex:
  'The reference implementation lives at...',
  'The performance later improved by 10%', // "later" is allowed (not in the regex)
  'This is a refactor of the existing flow', // "refactor" is allowed
];

// Remove the second item -- "deferred" IS a hit, my own test data was wrong.
const NEGATIVE_FIXED = NEGATIVE.filter((s) => !s.includes('deferred_load_strategy'));

for (const sample of NEGATIVE_FIXED) {
  ok(`negative: "${sample.slice(0, 60)}"`, () => {
    // When the bypass token is on the same line, scanBody skips the line.
    const hits = scanBody(sample);
    assert.equal(hits.length, 0, `expected 0 hits, got: ${JSON.stringify(hits)}`);
  });
}

// ── scanBody multi-line behaviour ───────────────────────────────────

ok('multi-line: catches a hit on line 3 of a 5-line block', () => {
  const body = ['clean', 'also clean', 'this is a follow-up note', 'still clean', 'clean'].join(
    '\n',
  );
  const hits = scanBody(body, 100); // pretend the block starts at file-line 100
  assert.equal(hits.length, 1);
  assert.equal(hits[0].lineNo, 102);
  assert.equal(hits[0].match.toLowerCase(), 'follow-up');
});

ok('multi-line: bypass token on the same line clears the hit', () => {
  const body = `// defer to next sprint ${BYPASS_TOKEN}`;
  const hits = scanBody(body);
  assert.equal(hits.length, 0);
});

ok('multi-line: bypass on a different line does NOT clear hits on other lines', () => {
  const body = ['line 1 says defer', `line 2 has ${BYPASS_TOKEN}`].join('\n');
  const hits = scanBody(body, 1);
  // Line 1's "defer" is NOT covered by line 2's token. Bypass is per-line.
  // The COMMIT MESSAGE bypass cleans whole-message scope -- that's handled
  // in runMessage, not scanBody.
  assert.equal(hits.length, 1);
  assert.equal(hits[0].lineNo, 1);
});

// ── isExemptPath ────────────────────────────────────────────────────

ok('exempt: AGENTS.md (Rule 13 enumerates the vocab)', () => {
  assert.ok(isExemptPath('AGENTS.md'));
});

ok('exempt: CHANGELOG.md (historical references allowed)', () => {
  assert.ok(isExemptPath('CHANGELOG.md'));
});

ok('exempt: docs/archive/old-design.md', () => {
  assert.ok(isExemptPath('docs/archive/old-design.md'));
});

ok('exempt: the script itself', () => {
  assert.ok(isExemptPath('scripts/system/verify-no-deflection.mjs'));
  assert.ok(isExemptPath('scripts/system/verify-no-deflection.test.mjs'));
});

ok('NON-exempt: regular source file', () => {
  assert.equal(isExemptPath('ui/src/routes/inbox/+page.svelte'), false);
  assert.equal(isExemptPath('scripts/native/check-ios-coverage.mjs'), false);
});

// ── Word-boundary edge cases ────────────────────────────────────────

ok('word-boundary: "deferential" does NOT match defer*', () => {
  // The regex is `defer(red|ral|ring)?` -- "deferential" has a suffix
  // not in the allowlist, but the regex IS prefix-greedy on the
  // optional group. Let's test it.
  const hits = scanBody('A deferential approach');
  // "deferential" starts with "defer" + "ential" which isn't in
  // (red|ral|ring)? -- so the regex matches "defer" only IF word-
  // boundary at "r/e" allows. Word-boundaries are between \w and \W;
  // "r" -> "e" is two \w chars, so no boundary, no match. Good.
  // EXCEPT: regex `defer(red|ral|ring)?` matches the bare "defer"
  // and `\b` at the end requires a non-word char. "deferential"
  // continues with "e" (a word char), so the `\b` fails. So "defer"
  // alone doesn't match. Good -- this should give 0 hits.
  assert.equal(hits.length, 0, `"deferential" must NOT trigger: ${JSON.stringify(hits)}`);
});

ok('word-boundary: "defer" alone matches', () => {
  const hits = scanBody('We defer until tomorrow.');
  assert.equal(hits.length, 1);
});

ok('word-boundary: "MVP" with adjacent punctuation matches', () => {
  const hits = scanBody('Ship as MVP, iterate later.');
  assert.equal(hits.length, 1);
});

// ── Hyphenation variants ────────────────────────────────────────────

ok('hyphenation: "follow up" and "follow-up" both match', () => {
  assert.equal(scanBody('We can follow up next week.').length, 1);
  assert.equal(scanBody('We can follow-up next week.').length, 1);
});

ok('separator required: bare "followup" feature identifier does NOT match', () => {
  // followup-cadence / followup-draft are legit feature module names, not the
  // "follow-up" deflection word. The pattern requires a hyphen or space so the
  // guard catches deflection prose without flagging $lib/server/followup-cadence.
  assert.equal(scanBody("vi.mock('$lib/server/followup-cadence', () => ({}))").length, 0);
  assert.equal(scanBody('the followup mode drafts a message').length, 0);
});

ok('hyphenation: "out of scope" and "out-of-scope" both match', () => {
  assert.equal(scanBody('That is out of scope.').length, 1);
  assert.equal(scanBody('That is out-of-scope.').length, 1);
});

// ── Final report ────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'OK' : 'FAIL'} ${passed}/${passed + failed} test(s) passed`);
process.exit(failed === 0 ? 0 : 1);
