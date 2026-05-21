/**
 * Unit tests for format-reviewers.mjs.
 * Run: node --test .github/scripts/sticky/format-reviewers.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-reviewers.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-rev-'));
}

function runFormat(changedFiles, codeowners, extraArgs = []) {
  const dir = makeTmp();
  const filesPath = path.join(dir, 'changed.txt');
  fs.writeFileSync(filesPath, changedFiles.join('\n'));
  const codeownersPath = path.join(dir, 'CODEOWNERS');
  if (codeowners !== null) fs.writeFileSync(codeownersPath, codeowners);
  const args = [
    SCRIPT,
    filesPath,
    codeowners !== null ? codeownersPath : codeownersPath,
    ...extraArgs,
  ];
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-reviewers', () => {
  it('renders pass verdict when every changed file has an owner', () => {
    const out = runFormat(['src/app.ts', 'src/server.ts'], '/src/ @team/backend');
    assert.ok(out.includes('## ✅ Reviewers:'), 'pass verdict missing');
    assert.ok(out.includes('@team/backend'), 'owner missing');
    assert.ok(out.includes('Suggested reviewers'), 'suggestion header missing');
  });

  it('renders non-pass verdict when some files have no CODEOWNER', () => {
    // NOTE: format-reviewers passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const out = runFormat(['src/app.ts', 'docs/orphan.md'], '/src/ @team/backend');
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('Files without a CODEOWNER'), 'orphan section missing');
    assert.ok(out.includes('`docs/orphan.md`'), 'orphan file missing');
  });

  it('shows union of multiple owners across distinct paths', () => {
    const out = runFormat(
      ['src/app.ts', 'docs/x.md'],
      ['/src/ @team/backend', '/docs/ @team/docs'].join('\n'),
    );
    assert.ok(out.includes('@team/backend'));
    assert.ok(out.includes('@team/docs'));
    assert.ok(out.includes('2 owner'), '2 owners count missing');
  });

  it('applies last-match-wins CODEOWNERS semantics', () => {
    const out = runFormat(
      ['src/critical.ts'],
      ['/src/ @team/backend', '/src/critical.ts @team/security'].join('\n'),
    );
    assert.ok(out.includes('@team/security'), 'last-match owner missing');
    assert.ok(!out.includes('@team/backend'), 'earlier match should be overridden');
  });

  it('handles ** glob in CODEOWNERS', () => {
    const out = runFormat(['ui/src/lib/server/x.ts'], '/ui/**/server/*.ts @team/server');
    assert.ok(out.includes('@team/server'), 'double-star match missing');
  });

  it('--lottery picks N owners when union exceeds N (deterministic by seed)', () => {
    const out = runFormat(
      ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      ['/a.ts @one', '/b.ts @two', '/c.ts @three', '/d.ts @four'].join('\n'),
      ['--lottery', '2', '--seed', 'abc123'],
    );
    assert.ok(out.includes('lottery'), 'lottery title missing');
    assert.ok(out.includes('2 of 4'), 'lottery count missing');
    // Re-run with same seed -- should produce same result
    const out2 = runFormat(
      ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      ['/a.ts @one', '/b.ts @two', '/c.ts @three', '/d.ts @four'].join('\n'),
      ['--lottery', '2', '--seed', 'abc123'],
    );
    // Extract the picked reviewers between the heading and the orphans section
    const pickedFromOut = out.match(/- @\w+/g) || [];
    const pickedFromOut2 = out2.match(/- @\w+/g) || [];
    assert.deepEqual(pickedFromOut, pickedFromOut2, 'lottery should be deterministic per seed');
  });

  it('--lottery is skipped when N >= union size', () => {
    const out = runFormat(['a.ts'], '/a.ts @one', ['--lottery', '5']);
    assert.ok(!out.includes('lottery'), 'should not show lottery when N >= union size');
    assert.ok(out.includes('@one'));
  });

  it('empty CODEOWNERS file leaves all files orphaned', () => {
    const out = runFormat(['a.ts', 'b.ts'], '# only comments\n');
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('2 of 2 changed files'), 'orphan count missing');
  });
});
