/**
 * Unit tests for format-bundle.mjs.
 * Run: node --test .github/scripts/sticky/format-bundle.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-bundle.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-bundle-'));
}

function runFormat(current, baseline) {
  const dir = makeTmp();
  const curPath = path.join(dir, 'current.json');
  fs.writeFileSync(curPath, JSON.stringify(current));
  const args = [SCRIPT, curPath];
  if (baseline) {
    const basePath = path.join(dir, 'baseline.json');
    fs.writeFileSync(basePath, JSON.stringify(baseline));
    args.push(basePath);
  }
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-bundle', () => {
  it('renders empty body when no bundles reported', () => {
    const out = runFormat([]);
    assert.ok(out.includes('No bundle-size report'), 'empty-state message missing');
    assert.ok(out.includes('## ✅'), 'pass verdict expected when zero chunks');
  });

  it('renders a single-bundle row within budget (clean: no per-row limit/status)', () => {
    const out = runFormat([{ name: 'App bundle', size: 12345, sizeLimit: 20000, passed: true }]);
    assert.ok(out.includes('## ✅ Bundle size:'), 'pass verdict missing');
    assert.ok(out.includes('| `App bundle` |'), 'bundle row missing');
    assert.ok(out.includes('12.06 KB') || out.includes('12.07 KB'), 'size humanized missing');
    assert.ok(out.includes('Δ vs main'), 'self-describing delta header missing');
    // Within-budget rows stay clean: the limit is NOT repeated per row.
    assert.ok(!out.includes('19.53 KB'), 'limit should not clutter a passing row');
    assert.ok(out.includes('new'), 'plain-text new-flag delta expected (no baseline)');
  });

  it('flags an over-budget chunk inline with its busted limit', () => {
    const out = runFormat([
      { name: 'App bundle', size: 25000, sizeLimit: 20000, passed: false },
      { name: 'Vendor', size: 5000, sizeLimit: 10000, passed: true },
    ]);
    assert.ok(out.includes('## ❌ Bundle size:'), 'fail verdict missing');
    assert.ok(out.includes('1 chunk') && out.includes('over budget'), 'fail title missing');
    assert.ok(out.includes('❌ `App bundle`'), 'over-budget chunk should carry the glyph');
    assert.ok(out.includes('19.53 KB'), 'busted limit shown inline on the failing row');
  });

  it('renders delta vs baseline when both present', () => {
    const out = runFormat(
      [{ name: 'App bundle', size: 12000, sizeLimit: 20000, passed: true }],
      [{ name: 'App bundle', size: 10000, sizeLimit: 20000, passed: true }],
    );
    assert.ok(out.includes('▴ +') || out.includes('+2'), 'positive delta missing');
  });

  it('accepts size-limit binary output shape ({paths: [...]})', () => {
    const out = runFormat({ paths: [{ name: 'a', size: 100, sizeLimit: 1000, passed: true }] });
    assert.ok(out.includes('| `a` |'));
  });

  it('marks a brand-new bundle "new" when missing from baseline', () => {
    const out = runFormat(
      [
        { name: 'A', size: 100, sizeLimit: 1000, passed: true },
        { name: 'B', size: 200, sizeLimit: 1000, passed: true },
      ],
      [{ name: 'A', size: 100, sizeLimit: 1000, passed: true }],
    );
    assert.ok(out.includes('new'), 'new-bundle marker missing');
  });

  it('falls back to gzipped field when size is absent', () => {
    const out = runFormat([{ name: 'gz', gzipped: 2048, passed: true }]);
    assert.ok(out.includes('2.00 KB'), 'gzipped fallback missing');
  });
});
