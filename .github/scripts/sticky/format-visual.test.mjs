/**
 * Unit tests for format-visual.mjs.
 * Run: node --test .github/scripts/sticky/format-visual.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-visual.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-visual-'));
}

function runFormat(payload, extraArgs = []) {
  const dir = makeTmp();
  const filePath = path.join(dir, 'output.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  const out = execFileSync(process.execPath, [SCRIPT, filePath, ...extraArgs], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-visual', () => {
  it('renders pass verdict when no shots changed', () => {
    const out = runFormat({ addedShots: [], removedShots: [], differenceShots: [] });
    assert.ok(out.includes('## ✅ Visual regression: no changes'), 'pass verdict missing');
    assert.ok(out.includes('All snapshots match'), 'pass-state explanation missing');
  });

  it('renders non-pass verdict when there are diffs', () => {
    // NOTE: format-visual passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat({
      addedShots: [],
      removedShots: [],
      differenceShots: [{ name: 'homepage', url: 'diff/homepage.png', diffPercent: 0.034 }],
    });
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('Visual regression:'), 'title missing');
    assert.ok(out.includes('1 change') || out.includes('1 diff'), 'diff count missing');
    assert.ok(out.includes('3.40%'), 'diff percent missing');
    assert.ok(out.includes('Changed snapshots'), 'changed-snapshots header missing');
  });

  it('renders collapsible for new snapshots', () => {
    const out = runFormat({
      addedShots: [{ name: 'about', url: 'about.png' }],
      removedShots: [],
      differenceShots: [],
    });
    assert.ok(out.includes('<details>'), 'collapsible missing');
    assert.ok(out.includes('1 new snapshot'), 'new-snapshot summary missing');
    assert.ok(out.includes('`about`'), 'snapshot name missing');
  });

  it('renders collapsible for removed snapshots', () => {
    const out = runFormat({
      addedShots: [],
      removedShots: [
        { name: 'old1', url: '.' },
        { name: 'old2', url: '.' },
      ],
      differenceShots: [],
    });
    assert.ok(out.includes('2 removed snapshot'), 'removed-snapshot summary missing');
    assert.ok(out.includes('`old1`'));
    assert.ok(out.includes('`old2`'));
  });

  it('honors --diff-base-url for linking diff images', () => {
    const out = runFormat(
      {
        addedShots: [],
        removedShots: [],
        differenceShots: [{ name: 'home', url: 'diff/home.png', diffPercent: 0.02 }],
      },
      ['--diff-base-url', 'https://artifacts.example.com'],
    );
    assert.ok(out.includes('https://artifacts.example.com/diff/home.png'), 'diff URL not linked');
    assert.ok(out.includes('[`home`]'), 'linked label missing');
  });

  it('renders -- for non-numeric diffPercent', () => {
    const out = runFormat({
      addedShots: [],
      removedShots: [],
      differenceShots: [{ name: 'x', url: 'x.png' }],
    });
    assert.ok(out.includes('--'), 'missing diffPercent placeholder missing');
  });

  it('mixes adds + removes + diffs into a single multi-section sticky', () => {
    const out = runFormat({
      addedShots: [{ name: 'new', url: 'n.png' }],
      removedShots: [{ name: 'gone', url: 'g.png' }],
      differenceShots: [{ name: 'changed', url: 'c.png', diffPercent: 0.05 }],
    });
    assert.ok(out.includes('1 diff'), 'diff count missing');
    assert.ok(out.includes('1 new'), 'new count missing');
    assert.ok(out.includes('1 removed'), 'removed count missing');
    assert.ok(out.includes('5.00%'));
  });
});
