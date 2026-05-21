/**
 * Unit tests for format-api.mjs.
 * Run: node --test .github/scripts/sticky/format-api.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-api.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-api-'));
}

function runFormat(payload) {
  const dir = makeTmp();
  const filePath = path.join(dir, 'oasdiff.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  const out = execFileSync(process.execPath, [SCRIPT, filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-api', () => {
  it('renders pass verdict when no changes', () => {
    const out = runFormat({});
    assert.ok(out.includes('## ✅ API: no changes'), 'pass verdict missing');
    assert.ok(out.includes('No OpenAPI diff'), 'no-diff explanation missing');
  });

  it('renders pass verdict for empty breaking/non-breaking arrays', () => {
    const out = runFormat({ breaking: [], 'non-breaking': [] });
    assert.ok(out.includes('## ✅ API: no changes'), 'pass verdict missing');
  });

  it('renders fail verdict for breaking changes (object shape)', () => {
    const out = runFormat({
      breaking: [
        {
          operation: 'GET /users',
          description: 'Removed required parameter `id`',
        },
      ],
      'non-breaking': [],
    });
    assert.ok(out.includes('## ❌ API:'), 'fail verdict missing');
    assert.ok(out.includes('1 BREAKING'), 'breaking count missing');
    assert.ok(out.includes('`GET /users`'), 'operation missing');
    assert.ok(out.includes('Removed required parameter'), 'description missing');
  });

  it('renders non-pass verdict for non-breaking only', () => {
    // NOTE: format-api passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat({
      breaking: [],
      'non-breaking': [{ operation: 'POST /foo', description: 'added optional field' }],
    });
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(!out.includes('## ❌'), 'should not be fail verdict (no breaking)');
    assert.ok(out.includes('1 non-breaking'), 'non-breaking count missing');
    assert.ok(out.includes('<details>'), 'non-breaking collapsible missing');
    assert.ok(out.includes('`POST /foo`'));
  });

  it('accepts array shape with severity field', () => {
    const out = runFormat([
      { operation: 'DELETE /x', description: 'Removed', severity: 'BREAKING' },
      { operation: 'POST /y', description: 'Added field', severity: 'INFO' },
    ]);
    assert.ok(out.includes('## ❌ API:'), 'fail verdict missing');
    assert.ok(out.includes('1 BREAKING'));
    assert.ok(out.includes('1 non-breaking'));
  });

  it('accepts `level` as alternate severity key', () => {
    const out = runFormat([{ operation: 'DELETE /x', description: 'Removed', level: 'BREAKING' }]);
    assert.ok(out.includes('## ❌ API:'), 'fail verdict missing');
    assert.ok(out.includes('1 BREAKING'));
  });

  it('falls back to ? when operation/description missing', () => {
    const out = runFormat({ breaking: [{}], 'non-breaking': [] });
    assert.ok(out.includes('`?`'), 'fallback for missing operation');
  });

  it('falls back to `text` field when `description` absent', () => {
    const out = runFormat({
      breaking: [{ operation: '/x', text: 'detail from text field' }],
      'non-breaking': [],
    });
    assert.ok(out.includes('detail from text field'), 'text-field fallback missing');
  });
});
