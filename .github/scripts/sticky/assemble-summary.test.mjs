#!/usr/bin/env node
// TDD suite for assemble-summary.mjs (pure render helpers). Plain node.
import assert from 'node:assert/strict';
import {
  DESC_MARKER_START,
  ORDER,
  deriveState,
  isExpanded,
  renderComment,
  renderMatrix,
  replaceDescriptionBlock,
  sectionFor,
} from './assemble-summary.mjs';
import { EMOJI, statusEmoji } from './lib.mjs';

const mk = (emoji, title, body = 'detail') => `## ${emoji} ${title}\n\n${body}`;

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
it('deriveState: maps each verdictHeader emoji', () => {
  assert.equal(deriveState(mk(EMOJI.pass, 'Coverage')), 'pass');
  assert.equal(deriveState(mk(EMOJI.fail, 'Lint')), 'fail');
  assert.equal(deriveState(mk(EMOJI.cancelled, 'X')), 'fail');
  assert.equal(deriveState(mk(EMOJI.warn, 'a11y')), 'warn');
  assert.equal(deriveState(mk(EMOJI.neutral, 'X')), 'warn');
  assert.equal(deriveState(mk(EMOJI.skip, 'i18n')), 'skip');
  assert.equal(deriveState(mk(EMOJI.queued, 'X')), 'pending');
});
it('deriveState: empty / null -> pending', () => {
  assert.equal(deriveState(''), 'pending');
  assert.equal(deriveState(null), 'pending');
  assert.equal(deriveState('   \n  '), 'pending');
});
it('deriveState: skips leading blank lines to find the header', () => {
  assert.equal(deriveState(`\n\n${mk(EMOJI.fail, 'X')}`), 'fail');
});

// ── isExpanded ───────────────────────────────────────────────────
it('isExpanded: only fail + warn open', () => {
  assert.equal(isExpanded('fail'), true);
  assert.equal(isExpanded('warn'), true);
  assert.equal(isExpanded('pass'), false);
  assert.equal(isExpanded('skip'), false);
  assert.equal(isExpanded('pending'), false);
});

// ── sectionFor ───────────────────────────────────────────────────
it('sectionFor: pass collapses, keeps emoji+title in summary, body inside', () => {
  const s = sectionFor('coverage', mk(EMOJI.pass, 'Coverage: 84%', 'TABLE'));
  assert.ok(s.startsWith('<details>'), 'pass should be collapsed');
  assert.ok(s.includes(`<summary>${EMOJI.pass} Coverage: 84%</summary>`));
  assert.ok(s.includes('TABLE'));
});
it('sectionFor: fail auto-expands', () => {
  const s = sectionFor('a11y', mk(EMOJI.fail, 'a11y: 2 violations', 'rows'));
  assert.ok(s.startsWith('<details open>'), 'fail should be expanded');
});

// ── renderMatrix ─────────────────────────────────────────────────
it('renderMatrix: emoji + label per entry', () => {
  const row = renderMatrix([
    { domain: 'coverage', state: 'pass' },
    { domain: 'a11y', state: 'warn' },
    { domain: 'perf', state: 'pending' },
  ]);
  assert.equal(
    row,
    `${EMOJI.pass} Coverage · ${statusEmoji('warn')} a11y · ${EMOJI.queued} Lighthouse`,
  );
});

// ── renderComment ────────────────────────────────────────────────
it('renderComment: header + matrix + sections only for present domains', () => {
  const entries = [
    { domain: 'quality', md: mk(EMOJI.pass, 'Quality'), state: 'pass' },
    { domain: 'coverage', md: null, state: 'pending' },
  ];
  const c = renderComment(entries);
  assert.ok(c.includes('## 🐦 Heron PR report'));
  assert.ok(c.includes(`${EMOJI.pass} Quality · ${EMOJI.queued} Coverage`));
  assert.ok(c.includes('<summary>✅ Quality</summary>'));
  assert.ok(!c.includes('Coverage</summary>'), 'pending domain has no section');
});

// ── replaceDescriptionBlock ──────────────────────────────────────
it('replaceDescriptionBlock: replaces existing block, drops old content', () => {
  const desc = `Intro\n\n${DESC_MARKER_START}\nstale\n<!-- CI-STATUS-MARKER-END -->\n\nOutro`;
  const out = replaceDescriptionBlock(desc, [{ domain: 'quality', state: 'pass' }]);
  assert.ok(out.includes(`🚦 **CI:** ${EMOJI.pass} Quality`));
  assert.ok(!out.includes('stale'));
  assert.ok(out.includes('Intro') && out.includes('Outro'));
});
it('replaceDescriptionBlock: appends when no block present', () => {
  const out = replaceDescriptionBlock('Just a description', [{ domain: 'quality', state: 'pass' }]);
  assert.ok(out.includes('Just a description'));
  assert.ok(out.includes(DESC_MARKER_START));
});

// ── ORDER ────────────────────────────────────────────────────────
it('ORDER: covers all 13 domains', () => {
  assert.equal(ORDER.length, 13);
  for (const d of ['quality', 'coverage', 'a11y', 'visual', 'bundle', 'perf', 'reviewers'])
    assert.ok(ORDER.includes(d), `${d} in ORDER`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
