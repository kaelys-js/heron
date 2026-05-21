/**
 * Unit tests for the sticky-comment shared library.
 *
 * Uses Node's built-in test runner so we don't need to register
 * .github/scripts as a vitest project (the repo's root vitest.config.ts
 * is a tripwire that refuses root-level invocation).
 *
 * Run via:  node --test .github/scripts/sticky/lib.test.mjs
 * In CI:    the format-comment workflow runs this before composing the
 *           sticky body, so broken helpers never reach a PR comment.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOJI,
  statusEmoji,
  deltaCell,
  pctBar,
  collapsibleSection,
  kbd,
  footer,
  table,
  verdictHeader,
  humanBytes,
  humanDuration,
} from './lib.mjs';

describe('statusEmoji', () => {
  const cases = [
    ['success', EMOJI.pass],
    ['pass', EMOJI.pass],
    ['Passed', EMOJI.pass],
    ['failure', EMOJI.fail],
    ['fail', EMOJI.fail],
    ['cancelled', EMOJI.cancelled],
    ['canceled', EMOJI.cancelled],
    ['skipped', EMOJI.skip],
    ['skip', EMOJI.skip],
    ['neutral', EMOJI.neutral],
    ['in_progress', EMOJI.queued],
    ['queued', EMOJI.queued],
    ['something-unknown', EMOJI.question],
    [undefined, EMOJI.question],
    [null, EMOJI.question],
    ['', EMOJI.question],
  ];
  for (const [input, expected] of cases) {
    it(`maps ${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(statusEmoji(input), expected);
    });
  }
});

describe('deltaCell', () => {
  it('reports improvement with up arrow + sign', () => {
    assert.ok(deltaCell(80, 84.32).includes('▴ +'));
  });
  it('reports regression with down arrow -', () => {
    assert.ok(deltaCell(84, 80).includes('▾ -'));
  });
  it('reports unchanged with =', () => {
    assert.equal(deltaCell(80, 80), '= 0.00%');
  });
  it('respects threshold (small deltas render as =)', () => {
    assert.equal(deltaCell(80, 80.01), '= 0.00%');
  });
  it('renders new flag when base is missing', () => {
    assert.ok(deltaCell(null, 80).includes('🆕'));
    assert.ok(deltaCell(undefined, 80).includes('🆕'));
  });
  it('renders removed flag when head is missing', () => {
    assert.ok(deltaCell(80, NaN).includes('🗑️'));
  });
  it('honors custom suffix', () => {
    assert.ok(deltaCell(100, 200, { suffix: ' KB', threshold: 1 }).includes('KB'));
  });
});

describe('pctBar', () => {
  it('renders 0% as all-empty', () => {
    assert.equal(pctBar(0, 10), '░'.repeat(10));
  });
  it('renders 100% as all-filled', () => {
    assert.equal(pctBar(100, 10), '█'.repeat(10));
  });
  it('renders 50% as half-and-half', () => {
    assert.equal(pctBar(50, 10), '█████░░░░░');
  });
  it('clamps negative values', () => {
    assert.equal(pctBar(-50, 10), '░'.repeat(10));
  });
  it('clamps values > 100', () => {
    assert.equal(pctBar(150, 10), '█'.repeat(10));
  });
});

describe('collapsibleSection', () => {
  it('produces a valid <details> block', () => {
    const out = collapsibleSection('Top 5 missing lines', 'file1\nfile2');
    assert.ok(out.includes('<details>'));
    assert.ok(out.includes('<summary>Top 5 missing lines</summary>'));
    assert.ok(out.includes('file1\nfile2'));
    assert.ok(out.includes('</details>'));
  });
});

describe('kbd', () => {
  it('wraps in backticks', () => {
    assert.equal(kbd('abc123'), '`abc123`');
  });
});

describe('footer', () => {
  it('includes SHA + repo + docs URL', () => {
    const f = footer({
      sha: 'abcdef1234567890',
      repo: 'kaelys-js/heron',
      timestamp: '2026-05-21 17:50',
    });
    assert.ok(f.includes('`abcdef1`'));
    assert.ok(f.includes('kaelys-js/heron'));
    assert.ok(f.includes('docs/CI.md'));
    assert.ok(f.includes('2026-05-21'));
  });
});

describe('table', () => {
  it('renders empty rows', () => {
    assert.equal(table([{ label: 'X' }], []), '_(no rows)_');
  });
  it('renders a 2-column table', () => {
    const out = table(
      [{ label: 'Path' }, { label: 'Size', align: 'right' }],
      [{ Path: 'foo.js', Size: '10 KB' }],
    );
    assert.ok(out.includes('| Path | Size |'));
    assert.ok(out.includes('|---|--:|'));
    assert.ok(out.includes('| foo.js | 10 KB |'));
  });
  it('honors center alignment', () => {
    const out = table([{ label: 'X', align: 'center' }], [{ X: 'a' }]);
    assert.ok(out.includes('|:-:|'));
  });
});

describe('verdictHeader', () => {
  it('builds a top-line H2 with emoji', () => {
    assert.equal(verdictHeader('Coverage: 84%', 'success'), `## ${EMOJI.pass} Coverage: 84%`);
  });
  it('appends an optional subline', () => {
    const out = verdictHeader('Coverage: 84%', 'success', '+0.18% vs base');
    assert.ok(out.includes('## ✅ Coverage: 84%'));
    assert.ok(out.includes('+0.18% vs base'));
  });
});

describe('humanBytes', () => {
  const cases = [
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.00 KB'],
    [1536, '1.50 KB'],
    [1048576, '1.00 MB'],
    [5242880, '5.00 MB'],
  ];
  for (const [input, expected] of cases) {
    it(`formats ${input} as ${expected}`, () => {
      assert.equal(humanBytes(input), expected);
    });
  }
});

describe('humanDuration', () => {
  const cases = [
    [500, '1s'],
    [1000, '1s'],
    [59000, '59s'],
    [60000, '1m 0s'],
    [90000, '1m 30s'],
    [3600000, '60m 0s'],
  ];
  for (const [input, expected] of cases) {
    it(`formats ${input}ms as ${expected}`, () => {
      assert.equal(humanDuration(input), expected);
    });
  }
});
