#!/usr/bin/env node
// TDD suite for assemble-summary.mjs (pure render helpers). Plain node.
import assert from 'node:assert/strict';
import {
  DESC_MARKER_START,
  ORDER,
  classify,
  deriveState,
  detailOf,
  hasBreakdown,
  headlineOf,
  renderComment,
  renderGroupsLine,
  renderRollup,
  renderTable,
  replaceDescriptionBlock,
  toSummary,
} from './assemble-summary.mjs';
import { EMOJI } from './lib.mjs';

const mk = (emoji, title, body = 'detail') => `## ${emoji} ${title}\n\n${body}`;
const TABLE = '| A | B |\n|---|---|\n| 1 | 2 |';

let failed = 0;
let passed = 0;
function it(name, fn) {
  try {
    fn();
    console.log(`  OK    ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}

console.log('assemble-summary.mjs -- unit tests\n');

// ── deriveState ──────────────────────────────────────────────────
it('deriveState: maps verdictHeader emoji + handles empty', () => {
  assert.equal(deriveState(mk(EMOJI.pass, 'X')), 'pass');
  assert.equal(deriveState(mk(EMOJI.fail, 'X')), 'fail');
  assert.equal(deriveState(mk(EMOJI.cancelled, 'X')), 'fail');
  assert.equal(deriveState(mk(EMOJI.warn, 'X')), 'warn');
  assert.equal(deriveState(mk(EMOJI.neutral, 'X')), 'warn');
  assert.equal(deriveState(mk(EMOJI.skip, 'X')), 'skip');
  assert.equal(deriveState(mk(EMOJI.queued, 'X')), 'pending');
  assert.equal(deriveState(''), 'pending');
  assert.equal(deriveState(null), 'pending');
});

// ── headlineOf ───────────────────────────────────────────────────
it('headlineOf: strips ## + emoji + short "Label:" prefix', () => {
  assert.equal(headlineOf('coverage', mk(EMOJI.pass, 'Coverage: 70.91%')), '70.91%');
  assert.equal(
    headlineOf('quality', mk(EMOJI.pass, 'Code quality: all checks pass')),
    'all checks pass',
  );
  assert.equal(
    headlineOf('bundle', mk(EMOJI.pass, 'Bundle size: 3 chunks within budget')),
    '3 chunks within budget',
  );
});
it('headlineOf: leaves a colon-free title alone', () => {
  assert.equal(
    headlineOf('reviewers', mk(EMOJI.pass, '1 owner covers all files')),
    '1 owner covers all files',
  );
});

// ── detailOf + hasBreakdown ──────────────────────────────────────
it('detailOf: returns body after the header', () => {
  assert.equal(detailOf(mk(EMOJI.pass, 'X', 'the body')), 'the body');
});
it('hasBreakdown: table or <details> yes; prose no', () => {
  assert.equal(hasBreakdown(TABLE), true);
  assert.equal(hasBreakdown('<details><summary>x</summary>y</details>'), true);
  assert.equal(hasBreakdown('just a sentence'), false);
  assert.equal(hasBreakdown(''), false);
});

// ── toSummary ────────────────────────────────────────────────────
it('toSummary: structures md; detail empty for prose-only', () => {
  const withTable = toSummary('coverage', mk(EMOJI.pass, 'Coverage: 70%', TABLE));
  assert.deepEqual(
    { status: withTable.status, headline: withTable.headline, hasDetail: !!withTable.detail },
    { status: 'pass', headline: '70%', hasDetail: true },
  );
  const prose = toSummary('a11y', mk(EMOJI.pass, 'Accessibility: clean', 'No violations.'));
  assert.equal(prose.detail, '', 'prose-only -> no collapsible');
});

// ── classify ─────────────────────────────────────────────────────
it('classify: groups by status', () => {
  const g = classify([
    { domain: 'a', status: 'pass' },
    { domain: 'b', status: 'fail' },
    { domain: 'c', status: 'warn' },
    { domain: 'd', status: 'skip' },
    { domain: 'e', status: 'pending' },
  ]);
  assert.deepEqual(
    g.passed.map((x) => x.domain),
    ['a'],
  );
  assert.deepEqual(
    g.attention.map((x) => x.domain),
    ['b', 'c'],
  );
  assert.deepEqual(
    g.notReported.map((x) => x.domain),
    ['d'],
  );
  assert.deepEqual(
    g.pending.map((x) => x.domain),
    ['e'],
  );
});

// ── renderRollup (GitHub alerts) ─────────────────────────────────
it('renderRollup: NOTE when all green', () => {
  const g = classify([{ domain: 'quality', status: 'pass' }]);
  const r = renderRollup(g, { sha: 'abcdef1234' });
  assert.ok(r.startsWith('> [!NOTE]'));
  assert.ok(r.includes('`abcdef1`'));
  assert.ok(r.includes('1 passed'));
});
it('renderRollup: CAUTION + Failing list on a failure', () => {
  const g = classify([
    { domain: 'a11y', status: 'fail' },
    { domain: 'docs', status: 'pass' },
  ]);
  const r = renderRollup(g, {});
  assert.ok(r.startsWith('> [!CAUTION]'));
  assert.ok(r.includes('**Failing:** Accessibility'));
});
it('renderRollup: WARNING on a warn (no fail)', () => {
  const g = classify([{ domain: 'a11y', status: 'warn' }]);
  assert.ok(renderRollup(g, {}).startsWith('> [!WARNING]'));
});

// ── renderTable + groups line ────────────────────────────────────
it('renderTable: Check | Result rows, no per-row emoji', () => {
  const t = renderTable([{ domain: 'coverage', status: 'pass', headline: '70.91%' }]);
  assert.ok(t.includes('| Check | Result |'));
  assert.ok(t.includes('| **Coverage** | 70.91% |'));
  assert.ok(!/[✅❌⚠️⬜⏳]/u.test(t), 'no emoji in the table');
});
it('renderGroupsLine: compact not-reported + pending', () => {
  const line = renderGroupsLine(
    [{ domain: 'type-coverage' }],
    [{ domain: 'visual' }, { domain: 'api' }],
  );
  assert.ok(line.includes('**Not reported:** Type coverage'));
  assert.ok(line.includes('**Pending:** Visual, API'));
});

// ── renderComment (integration) ──────────────────────────────────
it('renderComment: alert + table + groups line; failure auto-expands', () => {
  const entries = [
    toSummary('a11y', mk(EMOJI.fail, 'Accessibility: 2 violations', TABLE)),
    toSummary('coverage', mk(EMOJI.pass, 'Coverage: 70%', TABLE)),
    { domain: 'visual', status: 'pending', headline: '', detail: '' },
  ];
  const c = renderComment(entries, { sha: 'deadbeef' });
  assert.ok(c.includes('> [!CAUTION]'));
  assert.ok(c.includes('| **Accessibility** | 2 violations |'));
  assert.ok(c.includes('**Pending:** Visual'));
  assert.ok(c.includes('<details open><summary>Accessibility</summary>'), 'failure expanded');
  assert.ok(c.includes('<details><summary>Coverage</summary>'), 'pass collapsed');
});

// ── replaceDescriptionBlock ──────────────────────────────────────
it('replaceDescriptionBlock: replaces block; passing verdict', () => {
  const desc = `Intro\n\n${DESC_MARKER_START}\nstale\n<!-- CI-STATUS-MARKER-END -->\n\nOutro`;
  const out = replaceDescriptionBlock(desc, [{ domain: 'quality', status: 'pass' }]);
  assert.ok(out.includes('**CI:**'));
  assert.ok(!out.includes('stale'));
  assert.ok(out.includes('Intro') && out.includes('Outro'));
});

// ── ORDER ────────────────────────────────────────────────────────
it('ORDER: 13 domains', () => {
  assert.equal(ORDER.length, 13);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
