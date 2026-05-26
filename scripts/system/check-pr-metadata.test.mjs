#!/usr/bin/env node
/**
 * Unit tests for check-pr-metadata.mjs.
 *
 * Run: node scripts/system/check-pr-metadata.test.mjs
 *
 * Plain Node + assert, matching the other scripts/system/*.test.mjs files.
 * These tests pin the EXACT limits enforced server-side by
 * .github/workflows/pr-quality.yml so the local + CI gates can't drift.
 */
import assert from 'node:assert/strict';
import {
  checkTitleLength,
  checkTitleGrammar,
  checkBodySections,
  checkFeatIssue,
  checkFeatMotivation,
  checkBreakingBody,
  checkBreakingMigration,
  checkSize,
  checkLockfile,
  stripComments,
  extractSection,
} from './check-pr-metadata.mjs';

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

console.log('check-pr-metadata.mjs -- unit tests\n');

// ── title length (≤ 100) ────────────────────────────────────────────
ok('title-length: 100 chars passes', () =>
  assert.equal(checkTitleLength('x'.repeat(100)).ok, true),
);
ok('title-length: 101 chars fails', () =>
  assert.equal(checkTitleLength('x'.repeat(101)).ok, false),
);

// ── title grammar (conventional + lowercase subject) ────────────────
ok('grammar: feat(scope): lowercase ok', () =>
  assert.equal(checkTitleGrammar('feat(api): add retry helper').ok, true),
);
ok('grammar: no scope ok', () =>
  assert.equal(checkTitleGrammar('fix: handle empty pipeline').ok, true),
);
ok('grammar: breaking ! ok', () =>
  assert.equal(checkTitleGrammar('feat(api)!: drop v1 endpoint').ok, true),
);
ok('grammar: uppercase subject fails', () =>
  assert.equal(checkTitleGrammar('feat: Add retry helper').ok, false),
);
ok('grammar: unknown type fails', () =>
  assert.equal(checkTitleGrammar('feature: add thing').ok, false),
);
ok('grammar: missing colon fails', () =>
  assert.equal(checkTitleGrammar('feat add thing').ok, false),
);
ok('grammar: empty subject fails', () => assert.equal(checkTitleGrammar('chore: ').ok, false));

// ── body: Summary + Test plan ───────────────────────────────────────
const goodBody = `## Summary

This change rewrites the screenshot workflow to be deterministic and gated.

## Test plan

- [x] ran the unit tests and they pass on the diff engine boundaries
- [ ] manual smoke
`;
ok('body: well-formed passes', () => assert.equal(checkBodySections(goodBody).ok, true));
ok('body: short Summary fails', () => {
  const r = checkBodySections('## Summary\n\ntoo short\n\n## Test plan\n\n- [x] ' + 'y'.repeat(60));
  assert.equal(r.ok, false);
});
ok('body: Test plan without [x] fails', () => {
  const b = `## Summary\n\n${'s'.repeat(60)}\n\n## Test plan\n\n- [ ] ${'t'.repeat(60)}\n`;
  assert.equal(checkBodySections(b).ok, false);
});
ok('body: HTML comments are stripped (comment-only section fails)', () => {
  const b = `## Summary\n\n<!-- ${'x'.repeat(80)} -->\n\n## Test plan\n\n- [x] ${'t'.repeat(60)}\n`;
  assert.equal(checkBodySections(b).ok, false);
});
ok('stripComments removes <!-- --> across lines', () =>
  assert.equal(stripComments('a<!--\nblock\n-->b').trim(), 'ab'),
);
ok('extractSection grabs only its section', () => {
  const sec = extractSection('## A\nalpha\n## B\nbeta', 'A');
  assert.ok(sec.includes('alpha') && !sec.includes('beta'));
});
ok('extractSection: ### subheading does not terminate', () => {
  const sec = extractSection('## A\nalpha\n### sub\nmore\n## B\nbeta', 'A');
  assert.ok(sec.includes('alpha') && sec.includes('more') && !sec.includes('beta'));
});

// ── feat → issue link ───────────────────────────────────────────────
ok('feat-issue: non-feat is not applicable', () =>
  assert.equal(checkFeatIssue('fix: x', 'no ref', []).ok, true),
);
ok('feat-issue: feat with Fixes #12 ok', () =>
  assert.equal(checkFeatIssue('feat: x', 'Fixes #12', []).ok, true),
);
ok('feat-issue: feat without ref fails', () =>
  assert.equal(checkFeatIssue('feat: x', 'no reference here', []).ok, false),
);
ok('feat-issue: no-issue label bypasses', () =>
  assert.equal(checkFeatIssue('feat: x', 'no reference', ['no-issue']).ok, true),
);

// ── feat → Motivation ───────────────────────────────────────────────
ok('feat-motivation: ## Motivation >=30 ok', () =>
  assert.equal(checkFeatMotivation('feat: x', `## Motivation\n\n${'m'.repeat(40)}`).ok, true),
);
ok('feat-motivation: ## Why accepted', () =>
  assert.equal(checkFeatMotivation('feat: x', `## Why\n\n${'w'.repeat(40)}`).ok, true),
);
ok('feat-motivation: missing fails', () =>
  assert.equal(checkFeatMotivation('feat: x', 'no motivation section').ok, false),
);
ok('feat-motivation: non-feat not applicable', () =>
  assert.equal(checkFeatMotivation('chore: x', 'nothing').ok, true),
);

// ── breaking → BREAKING CHANGE body + Migration ─────────────────────
ok('breaking-body: !: with BREAKING CHANGE ok', () =>
  assert.equal(checkBreakingBody('feat!: x', 'BREAKING CHANGE: drops v1').ok, true),
);
ok('breaking-body: !: without block fails', () =>
  assert.equal(checkBreakingBody('feat!: x', 'no block').ok, false),
);
ok('breaking-body: non-breaking not applicable', () =>
  assert.equal(checkBreakingBody('feat: x', 'nothing').ok, true),
);
ok('breaking-migration: ## Migration >=30 ok', () =>
  assert.equal(checkBreakingMigration('feat!: x', `## Migration\n\n${'m'.repeat(40)}`).ok, true),
);
ok('breaking-migration: ## Rollback plan accepted', () =>
  assert.equal(
    checkBreakingMigration('feat!: x', `## Rollback plan\n\n${'r'.repeat(40)}`).ok,
    true,
  ),
);
ok('breaking-migration: missing fails', () =>
  assert.equal(checkBreakingMigration('feat!: x', 'no migration').ok, false),
);

// ── size (≤ 2000) ───────────────────────────────────────────────────
ok('size: 2000 ok', () => assert.equal(checkSize(1500, 500, []).ok, true));
ok('size: 2001 fails', () => assert.equal(checkSize(1500, 501, []).ok, false));
ok('size: oversize-ok bypasses', () =>
  assert.equal(checkSize(5000, 5000, ['oversize-ok']).ok, true),
);

// ── lockfile co-change ──────────────────────────────────────────────
ok('lockfile: dep change without lock fails', () =>
  assert.equal(checkLockfile(true, false).ok, false),
);
ok('lockfile: dep change with lock ok', () => assert.equal(checkLockfile(true, true).ok, true));
ok('lockfile: no dep change ok', () => assert.equal(checkLockfile(false, false).ok, true));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
