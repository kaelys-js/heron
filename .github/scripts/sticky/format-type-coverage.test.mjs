/**
 * Unit tests for format-type-coverage.mjs.
 * Run: node --test .github/scripts/sticky/format-type-coverage.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-type-coverage.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-tc-'));
}

function runFormat(current, baseline, opts = {}) {
  const dir = makeTmp();
  const curPath = path.join(dir, 'current.json');
  fs.writeFileSync(curPath, JSON.stringify(current));
  const args = [SCRIPT, curPath];
  if (baseline) {
    const basePath = path.join(dir, 'baseline.json');
    fs.writeFileSync(basePath, JSON.stringify(baseline));
    args.push(basePath);
  }
  if (opts.threshold) args.push('--threshold', opts.threshold);
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-type-coverage', () => {
  it('renders skip verdict when the input is unreadable (empty obj)', () => {
    const out = runFormat({});
    assert.ok(out.includes('Type coverage: no data'), 'no-data title missing');
    assert.ok(out.includes("Couldn't read"), 'error explanation missing');
  });

  it('renders pass verdict when percentage above threshold', () => {
    const out = runFormat({
      percentage: 99.5,
      totalCount: 10000,
      correctCount: 9950,
      fileCounts: [],
    });
    assert.ok(out.includes('## ✅ Type coverage: 99.50%'), 'pass verdict missing');
    assert.ok(out.includes('50 `any`s'), 'any count missing');
  });

  it('renders fail verdict when percentage below threshold', () => {
    const out = runFormat({
      percentage: 80.0,
      totalCount: 100,
      correctCount: 80,
      fileCounts: [],
    });
    assert.ok(out.includes('## ❌ Type coverage: 80.00%'), 'fail verdict missing');
    assert.ok(out.includes('> :warning:'), 'sub-threshold warning missing');
    assert.ok(out.includes('99%'), 'default threshold reference missing');
  });

  it('honors --threshold flag', () => {
    const out = runFormat(
      { percentage: 80.0, totalCount: 100, correctCount: 80, fileCounts: [] },
      null,
      { threshold: '75' },
    );
    assert.ok(out.includes('## ✅'), 'should pass at 75% threshold');
  });

  it('renders delta vs baseline', () => {
    const out = runFormat(
      { percentage: 99.5, totalCount: 10000, correctCount: 9950, fileCounts: [] },
      { percentage: 99.0, totalCount: 10000, correctCount: 9900, fileCounts: [] },
    );
    assert.ok(out.includes('▴ +'), 'positive delta missing');
  });

  it('omits the delta cleanly when no baseline supplied', () => {
    const out = runFormat({
      percentage: 99,
      totalCount: 100,
      correctCount: 99,
      fileCounts: [],
    });
    assert.ok(out.includes('Type coverage: 99.00%'), 'percentage missing');
    assert.ok(!out.includes('🆕'), 'no new-baseline emoji expected');
    assert.ok(!out.includes('99.00%  --'), 'no double space where the delta would sit');
  });

  it('shows top files with most `any`s', () => {
    const out = runFormat({
      percentage: 95,
      totalCount: 100,
      correctCount: 95,
      fileCounts: [
        ['src/big.ts', 50, 100], // 50 anys
        ['src/small.ts', 90, 100], // 10 anys
        ['src/clean.ts', 100, 100], // 0 anys (filtered out)
      ],
    });
    assert.ok(out.includes('<details>'), 'collapsible missing');
    assert.ok(out.includes('`src/big.ts`'), 'top file missing');
    assert.ok(out.includes('`src/small.ts`'), 'second file missing');
    assert.ok(!out.includes('`src/clean.ts`'), 'zero-any file should be filtered');
    // Verify ordering (big.ts before small.ts)
    const bigIdx = out.indexOf('`src/big.ts`');
    const smallIdx = out.indexOf('`src/small.ts`');
    assert.ok(bigIdx < smallIdx, 'top files should be sorted desc by any count');
  });

  it('handles missing fileCounts gracefully', () => {
    const out = runFormat({
      percentage: 99,
      totalCount: 100,
      correctCount: 99,
    });
    // Should not crash; collapsible may or may not appear but body must render.
    assert.ok(out.includes('Type coverage:'), 'body title missing');
  });
});
