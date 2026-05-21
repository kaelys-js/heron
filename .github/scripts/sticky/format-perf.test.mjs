/**
 * Unit tests for format-perf.mjs.
 * Run: node --test .github/scripts/sticky/format-perf.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-perf.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-perf-'));
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

describe('format-perf', () => {
  it('renders skip verdict when no pages are measured', () => {
    const out = runFormat([]);
    assert.ok(out.includes('No Lighthouse'), 'no-data message missing');
    assert.ok(out.includes('Performance: no Lighthouse data'), 'no-data title missing');
  });

  it('renders pass verdict when all pages >= 0.9 performance', () => {
    const out = runFormat([
      {
        url: 'https://example.com/',
        summary: { performance: 0.95, accessibility: 0.91, 'best-practices': 0.96, seo: 0.92 },
      },
    ]);
    assert.ok(out.includes('## ✅ Performance:'), 'pass verdict missing');
    assert.ok(out.includes('| `https://example.com/` |'), 'url row missing');
    assert.ok(out.includes('95%'), 'performance pct missing');
    assert.ok(out.includes('91%'), 'a11y pct missing');
  });

  it('renders non-pass verdict when any page below 0.9 performance', () => {
    // NOTE: format-perf passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case). The test asserts the
    // actual output so future changes are visible.
    const out = runFormat([
      { url: 'https://a/', summary: { performance: 0.95 } },
      { url: 'https://b/', summary: { performance: 0.65 } },
    ]);
    assert.ok(!out.includes('## ✅ Performance:'), 'should not be pass verdict');
    assert.ok(!out.includes('## ⬜ Performance:'), 'should not be skip verdict');
    assert.ok(out.includes('Performance:'), 'title missing');
    assert.ok(out.includes('65%'), 'low score missing');
  });

  it('renders delta vs baseline when both supplied', () => {
    const out = runFormat(
      [{ url: 'https://a/', summary: { performance: 0.92 } }],
      [{ url: 'https://a/', summary: { performance: 0.85 } }],
    );
    assert.ok(out.includes('▴ +'), 'positive delta arrow missing');
  });

  it('handles missing metrics with -- placeholder', () => {
    const out = runFormat([{ url: 'https://a/', summary: { performance: 0.95 } }]);
    assert.ok(out.includes('--'), 'missing metric placeholder missing');
  });

  it('accepts alternate scores key (not summary)', () => {
    const out = runFormat([
      { url: 'https://a/', scores: { performance: 0.95, accessibility: 0.95 } },
    ]);
    assert.ok(out.includes('95%'), 'score via "scores" key missing');
  });

  it('accepts requestedUrl in lieu of url', () => {
    const out = runFormat([{ requestedUrl: 'https://req/', summary: { performance: 0.95 } }]);
    assert.ok(out.includes('https://req/'), 'requestedUrl fallback missing');
  });
});
