/**
 * Unit tests for format-a11y.mjs.
 * Run: node --test .github/scripts/sticky/format-a11y.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-a11y.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-a11y-'));
}

function runFormat(payload) {
  const dir = makeTmp();
  const filePath = path.join(dir, 'axe.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  const out = execFileSync(process.execPath, [SCRIPT, filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-a11y', () => {
  it('renders pass verdict when no violations on any page', () => {
    const out = runFormat([
      { url: 'https://a/', violations: [] },
      { url: 'https://b/', violations: [] },
    ]);
    assert.ok(out.includes('## ✅ Accessibility: clean on 2 page'), 'pass verdict missing');
    assert.ok(out.includes('No axe-core violations'), 'pass explanation missing');
  });

  it('renders fail verdict when there is a critical violation', () => {
    const out = runFormat([
      {
        url: 'https://a/',
        violations: [
          {
            id: 'color-contrast',
            impact: 'critical',
            help: 'Elements must have sufficient contrast',
            helpUrl: 'https://dequeuniversity.com/...',
            nodes: [{}, {}, {}],
          },
        ],
      },
    ]);
    assert.ok(out.includes('## ❌ Accessibility:'), 'fail verdict missing');
    assert.ok(out.includes('1 critical'), 'critical count missing');
    assert.ok(out.includes('color-contrast'), 'rule id missing');
    assert.ok(out.includes('CRITICAL:'), 'impact label uppercased missing');
    assert.ok(out.includes('3 occurrences'), 'node-count rollup missing');
  });

  it('renders fail verdict for serious violations even without critical', () => {
    const out = runFormat([
      {
        url: 'https://a/',
        violations: [
          {
            id: 'aria-label',
            impact: 'serious',
            help: 'h',
            helpUrl: 'u',
            nodes: [{}],
          },
        ],
      },
    ]);
    assert.ok(out.includes('## ❌ Accessibility:'), 'fail verdict missing');
    assert.ok(out.includes('0 critical, 1 serious'), 'severity breakdown missing');
  });

  it('renders non-pass verdict for moderate/minor only', () => {
    // NOTE: format-a11y passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat([
      {
        url: 'https://a/',
        violations: [{ id: 'minor-1', impact: 'minor', help: 'h', helpUrl: 'u', nodes: [{}] }],
      },
    ]);
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(!out.includes('## ❌'), 'should not be fail verdict (no critical/serious)');
    assert.ok(out.includes('Accessibility:'));
  });

  it('groups violations by rule across multiple pages', () => {
    const out = runFormat([
      {
        url: 'https://a/',
        violations: [{ id: 'cc', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [{}, {}] }],
      },
      {
        url: 'https://b/',
        violations: [{ id: 'cc', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [{}] }],
      },
    ]);
    assert.ok(out.includes('3 occurrences'), 'cross-page rollup missing');
    assert.ok(out.includes('across 2 URLs'), 'URL count missing');
  });

  it('accepts a single-page object (not array)', () => {
    const out = runFormat({
      url: 'https://a/',
      violations: [{ id: 'x', impact: 'minor', help: 'h', helpUrl: 'u', nodes: [{}] }],
    });
    assert.ok(out.includes('x'), 'rule id missing');
  });

  it('shows breakdown table by impact', () => {
    const out = runFormat([
      {
        url: 'https://a/',
        violations: [
          { id: 'a', impact: 'critical', help: 'h', helpUrl: 'u', nodes: [{}] },
          { id: 'b', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [{}] },
          { id: 'c', impact: 'moderate', help: 'h', helpUrl: 'u', nodes: [{}] },
        ],
      },
    ]);
    assert.ok(out.includes('| Impact | Count |'), 'breakdown header missing');
    assert.ok(out.includes('| critical |'), 'critical row missing');
    assert.ok(out.includes('| serious |'), 'serious row missing');
  });
});
