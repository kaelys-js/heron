/**
 * Unit tests for format-docs.mjs.
 * Run: node --test .github/scripts/sticky/format-docs.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-docs.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-docs-'));
}

function writeJson(dir, name, payload) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(payload));
  return p;
}

function runFormat(args) {
  const dir = makeTmp();
  const cliArgs = [SCRIPT];
  for (const [flag, payload] of Object.entries(args)) {
    const p = writeJson(dir, `${flag}.json`, payload);
    cliArgs.push(`--${flag}=${p}`);
  }
  const out = execFileSync(process.execPath, cliArgs, { encoding: 'utf8', stdio: 'pipe' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-docs', () => {
  it('renders pass verdict when neither cspell nor remark reported issues', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    assert.ok(out.includes('## ✅ Docs: cspell + remark-lint clean'), 'pass verdict missing');
    assert.ok(out.includes('No spelling'), 'pass explanation missing');
  });

  it('renders pass verdict for empty arrays', () => {
    const out = runFormat({ cspell: [], remark: [] });
    assert.ok(out.includes('## ✅ Docs:'));
  });

  it('renders non-pass verdict for a few cspell issues (<20)', () => {
    // NOTE: format-docs passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat({
      cspell: [
        { uri: 'README.md', row: 12, text: 'foobarbaz' },
        { uri: 'docs/x.md', row: 5, text: 'misspelt' },
      ],
    });
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('2 spell'), 'spell-count missing');
    assert.ok(out.includes('<details>'), 'collapsible missing');
    assert.ok(out.includes('**foobarbaz**'), 'unknown word missing');
  });

  it('renders fail verdict for >= 20 total issues', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      uri: `f${i}.md`,
      row: i + 1,
      text: `word${i}`,
    }));
    const out = runFormat({ cspell: many });
    assert.ok(out.includes('## ❌ Docs:'), 'fail verdict missing');
    assert.ok(out.includes('25 spell'));
  });

  it('handles remark-lint vfile messages', () => {
    const out = runFormat({
      remark: [
        {
          path: 'README.md',
          messages: [
            {
              line: 10,
              ruleId: 'no-shell-dollars',
              reason: 'Do not use `$` before shell commands',
            },
          ],
        },
      ],
    });
    assert.ok(out.includes('1 lint issue'), 'lint count missing');
    assert.ok(out.includes('no-shell-dollars'), 'ruleId missing');
    assert.ok(out.includes('shell commands'), 'reason missing');
  });

  it('merges cspell + remark counts in the title', () => {
    const out = runFormat({
      cspell: [{ uri: 'a.md', row: 1, text: 'x' }],
      remark: [{ path: 'b.md', messages: [{ line: 2, ruleId: 'r', reason: 'oops' }] }],
    });
    assert.ok(out.includes('1 spell'), 'spell count missing');
    assert.ok(out.includes('1 lint'), 'lint count missing');
  });

  it('caps the top-N collapsible at 20 entries', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      uri: `f${i}.md`,
      row: 1,
      text: `word${i}`,
    }));
    const out = runFormat({ cspell: many });
    assert.ok(out.includes('Top 20 spelling issues (of 30)'), 'top-N header missing/incorrect');
  });

  it('accepts cspell wrapper shape ({issues: [...]})', () => {
    const out = runFormat({
      cspell: { issues: [{ uri: 'a.md', row: 1, text: 'wrd' }] },
    });
    assert.ok(out.includes('1 spell'), 'cspell.issues shape not handled');
  });
});
