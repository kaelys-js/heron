/**
 * Unit tests for discover-coverage.mjs.
 *
 * Runs via:  node --test .github/scripts/sticky/discover-coverage.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/discover-coverage.mjs');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-cov-'));
  return dir;
}

function rm(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function runDiscover(root) {
  const out = execFileSync(process.execPath, [SCRIPT, '--root', root], {
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

describe('discover-coverage', () => {
  let repo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => {
    rm(repo);
  });

  it('returns an empty flags list when no coverage files exist', () => {
    const out = runDiscover(repo);
    assert.equal(out.schema_version, 1);
    assert.deepEqual(out.flags, []);
  });

  it('discovers an Istanbul coverage-summary.json under ui/coverage', () => {
    const dir = path.join(repo, 'ui', 'coverage');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 35, pct: 70 },
          statements: { total: 100, covered: 80, pct: 80 },
          functions: { total: 30, covered: 28, pct: 93.33 },
        },
        'src/foo.ts': { lines: { total: 50, covered: 30, pct: 60 } },
        'src/bar.ts': { lines: { total: 50, covered: 50, pct: 100 } },
      }),
    );
    const out = runDiscover(repo);
    assert.equal(out.flags.length, 1);
    const flag = out.flags[0];
    assert.equal(flag.name, 'ui');
    assert.equal(flag.format, 'istanbul');
    assert.equal(flag.lines_pct, 80);
    assert.equal(flag.branches_pct, 70);
    assert.equal(flag.files_count, 2);
    assert.equal(flag.missing_lines_count, 20);
    assert.equal(flag.top_uncovered_files[0].path, 'src/foo.ts');
  });

  it('discovers an lcov.info under ui/electron/coverage', () => {
    const dir = path.join(repo, 'ui', 'electron', 'coverage');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'lcov.info'),
      [
        'SF:src/main.ts',
        'LF:50',
        'LH:40',
        'BRF:20',
        'BRH:15',
        'end_of_record',
        'SF:src/window.ts',
        'LF:30',
        'LH:30',
        'BRF:10',
        'BRH:10',
        'end_of_record',
      ].join('\n'),
    );
    const out = runDiscover(repo);
    assert.equal(out.flags.length, 1);
    const flag = out.flags[0];
    assert.equal(flag.name, 'electron');
    assert.equal(flag.format, 'lcov');
    assert.equal(flag.files_count, 2);
    assert.equal(flag.missing_lines_count, 10);
    assert.ok(Math.abs(flag.lines_pct - 87.5) < 0.01); // (40+30)/(50+30) = 87.5%
  });

  it('discovers a cobertura.xml from a fastlane xcov path', () => {
    const dir = path.join(repo, 'ui', 'ios', 'App', 'fastlane', 'coverage');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'cobertura.xml'),
      `<?xml version="1.0"?>
<coverage line-rate="0.83" branch-rate="0.72" lines-valid="1000" lines-covered="830">
  <packages>
    <package>
      <classes>
        <class name="Foo" filename="src/Foo.swift" line-rate="0.50"/>
        <class name="Bar" filename="src/Bar.swift" line-rate="1.0"/>
      </classes>
    </package>
  </packages>
</coverage>`,
    );
    const out = runDiscover(repo);
    assert.equal(out.flags.length, 1);
    const flag = out.flags[0];
    assert.equal(flag.name, 'ios');
    assert.equal(flag.format, 'cobertura');
    assert.equal(Math.round(flag.lines_pct), 83);
    assert.equal(Math.round(flag.branches_pct), 72);
    assert.equal(flag.missing_lines_count, 170);
  });

  it('discovers multiple flags when multiple coverage roots present', () => {
    fs.mkdirSync(path.join(repo, 'ui', 'coverage'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'ui', 'electron', 'coverage'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'ui', 'coverage', 'lcov.info'),
      'SF:src/a.ts\nLF:10\nLH:10\nend_of_record\n',
    );
    fs.writeFileSync(
      path.join(repo, 'ui', 'electron', 'coverage', 'lcov.info'),
      'SF:src/main.ts\nLF:20\nLH:15\nend_of_record\n',
    );
    const out = runDiscover(repo);
    assert.equal(out.flags.length, 2);
    const names = out.flags.map((f) => f.name).sort();
    assert.deepEqual(names, ['electron', 'ui']);
  });

  it('skips node_modules and build directories', () => {
    const dir = path.join(repo, 'node_modules', 'foo', 'coverage');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'lcov.info'), 'SF:x\nLF:1\nLH:1\nend_of_record\n');
    const out = runDiscover(repo);
    assert.deepEqual(out.flags, []);
  });

  it('handles a coverage file at the repo root as flag `default`', () => {
    const dir = path.join(repo, 'coverage');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { total: 1, covered: 1, pct: 100 } } }),
    );
    const out = runDiscover(repo);
    assert.equal(out.flags.length, 1);
    assert.equal(out.flags[0].name, 'default');
  });
});
