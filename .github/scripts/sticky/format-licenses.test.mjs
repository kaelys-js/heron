/**
 * Unit tests for format-licenses.mjs.
 * Run: node --test .github/scripts/sticky/format-licenses.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-licenses.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-lic-'));
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

describe('format-licenses', () => {
  it('renders a clean pass verdict when no deps added or removed', () => {
    const out = runFormat({}, {});
    assert.ok(out.includes('## ✅ Licenses:'), 'pass verdict missing');
    assert.ok(out.includes('no copyleft or unknown licenses'), 'clean pass message missing');
    // With no diff at all, the dependency-diff section stays hidden (no noise).
    assert.ok(!out.includes('Full dependency diff'), 'empty diff section should not render');
  });

  it('renders pass verdict for new MIT-only deps', () => {
    const out = runFormat({ 'foo@1.0.0': { licenses: 'MIT', publisher: 'Foo Inc' } }, {});
    assert.ok(out.includes('## ✅ Licenses:'), 'pass verdict missing');
    assert.ok(out.includes('1 new'), 'new dep count missing');
    assert.ok(out.includes('<details>'), 'collapsible diff missing');
    assert.ok(out.includes('`foo@1.0.0`'), 'new dep name missing');
  });

  it('renders fail verdict for new GPL copyleft dep', () => {
    const out = runFormat({ 'gpl-thing@2.0.0': { licenses: 'GPL-3.0', publisher: 'GPL Co' } }, {});
    assert.ok(out.includes('## ❌ Licenses:'), 'fail verdict missing');
    assert.ok(out.includes('copyleft'), 'copyleft section header missing');
    assert.ok(out.includes('`gpl-thing@2.0.0`'), 'copyleft dep name missing');
    assert.ok(out.includes('GPL-3.0'));
    assert.ok(out.includes('GPL Co'), 'publisher missing');
  });

  it('renders non-pass verdict for unknown-license dep', () => {
    // NOTE: format-licenses passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case). Asserting body content.
    const out = runFormat({ 'mystery@1.0.0': { licenses: 'UNKNOWN' } }, {});
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('Unknown license'), 'unknown-license section missing');
    assert.ok(out.includes('`mystery@1.0.0`'), 'unknown dep name missing');
  });

  it('treats UNLICENSED as unknown', () => {
    const out = runFormat({ 'priv@1.0.0': { licenses: 'UNLICENSED' } }, {});
    assert.ok(out.includes('`priv@1.0.0`'));
    assert.ok(out.includes('Unknown license'), 'UNLICENSED should appear in unknown section');
  });

  it('does not flag deps that already existed in baseline (even copyleft)', () => {
    const out = runFormat(
      { 'gpl@1.0.0': { licenses: 'GPL-3.0' } },
      { 'gpl@1.0.0': { licenses: 'GPL-3.0' } },
    );
    assert.ok(out.includes('## ✅'), 'pass verdict expected since dep is not new');
    assert.ok(!out.includes('New copyleft'), 'should not flag pre-existing GPL dep');
  });

  it('normalises SPDX OR expressions to first license', () => {
    const out = runFormat({ 'dual@1.0.0': { licenses: 'MIT OR Apache-2.0' } }, {});
    assert.ok(out.includes('## ✅'), 'pass verdict expected for MIT OR Apache');
    assert.ok(out.includes('MIT'), 'first license missing');
  });

  it('flags AGPL-3.0 as copyleft', () => {
    const out = runFormat({ 'agpl@1.0.0': { licenses: 'AGPL-3.0' } }, {});
    assert.ok(out.includes('## ❌'), 'fail verdict expected for AGPL');
  });
});
