/**
 * Unit tests for format-i18n.mjs.
 * Run: node --test .github/scripts/sticky/format-i18n.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-i18n.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-i18n-'));
}

function runFormat(payload) {
  const dir = makeTmp();
  const filePath = path.join(dir, 'coverage.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  const out = execFileSync(process.execPath, [SCRIPT, filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-i18n', () => {
  it('renders skip verdict when locale list is empty', () => {
    const out = runFormat({ locales: [], totals: {} });
    assert.ok(out.includes('i18n: no locales declared'), 'skip title missing');
  });

  it('renders pass verdict when all locales >= 95%', () => {
    const out = runFormat({
      locales: ['en', 'de'],
      totals: {
        en: { translated: 1000, missing: 0 },
        de: { translated: 980, missing: 20 },
      },
    });
    assert.ok(out.includes('## ✅ i18n:'), 'pass verdict missing');
    assert.ok(out.includes('| `en` |'), 'en row missing');
    assert.ok(out.includes('| `de` |'), 'de row missing');
    assert.ok(out.includes('100.0%'), 'en pct missing');
    assert.ok(out.includes('98.0%'), 'de pct missing');
    assert.ok(out.includes('█'), 'pctBar character missing');
  });

  it('renders non-pass verdict when worst locale between 70% and 95%', () => {
    // NOTE: format-i18n passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat({
      locales: ['en', 'fr'],
      totals: {
        en: { translated: 1000, missing: 0 },
        fr: { translated: 800, missing: 200 },
      },
    });
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(!out.includes('## ❌'), 'should not be fail verdict for 80% (above 70 threshold)');
    assert.ok(out.includes('worst 80.0%'), 'worst-coverage in title missing');
  });

  it('renders fail verdict when worst locale below 70%', () => {
    const out = runFormat({
      locales: ['en', 'ja'],
      totals: {
        en: { translated: 1000, missing: 0 },
        ja: { translated: 500, missing: 500 },
      },
    });
    assert.ok(out.includes('## ❌ i18n:'), 'fail verdict missing');
    assert.ok(out.includes('worst 50.0%'));
  });

  it('handles 100% on a zero-key locale (no division by zero)', () => {
    const out = runFormat({
      locales: ['empty'],
      totals: { empty: { translated: 0, missing: 0 } },
    });
    assert.ok(out.includes('## ✅'), 'pass verdict expected for 0/0 (=100%)');
    assert.ok(out.includes('100.0%'));
  });

  it('derives locales from totals keys if locales array omitted', () => {
    const out = runFormat({
      totals: { en: { translated: 100, missing: 0 } },
    });
    assert.ok(out.includes('| `en` |'), 'locale row missing');
  });

  it('renders pctBar in the coverage column', () => {
    const out = runFormat({
      locales: ['en'],
      totals: { en: { translated: 50, missing: 50 } },
    });
    assert.ok(out.includes('50.0%'), 'pct missing');
    // pctBar(50, 10) renders 5 filled + 5 empty
    assert.ok(out.includes('█████░░░░░'), 'pctBar rendering missing');
  });
});
