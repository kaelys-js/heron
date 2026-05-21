/**
 * Unit tests for format-coverage.mjs.
 * Run: node --test .github/scripts/sticky/format-coverage.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-coverage.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'format-cov-'));
}

function runFormat(currentJson, baselineJson) {
  const dir = makeTmp();
  const curPath = path.join(dir, 'current.json');
  fs.writeFileSync(curPath, JSON.stringify(currentJson));
  const args = [SCRIPT, curPath];
  if (baselineJson) {
    const basePath = path.join(dir, 'baseline.json');
    fs.writeFileSync(basePath, JSON.stringify(baselineJson));
    args.push(basePath);
  }
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-coverage', () => {
  it('renders an empty body when no flags exist', () => {
    const out = runFormat({ flags: [] });
    assert.ok(out.includes('No coverage reports found'));
  });

  it('renders a single-flag table with a percentage bar', () => {
    const out = runFormat({
      flags: [
        {
          name: 'ui',
          format: 'istanbul',
          lines_pct: 84.32,
          branches_pct: 71.18,
          statements_pct: 84.3,
          functions_pct: 88.1,
          files_count: 142,
          missing_lines_count: 1843,
          top_uncovered_files: [],
        },
      ],
    });
    assert.ok(out.includes('## ✅ Coverage:'), 'top-line verdict missing');
    assert.ok(out.includes('| `ui` |'), 'ui flag row missing');
    assert.ok(out.includes('84.32%'), 'lines_pct missing');
    assert.ok(out.includes('█'), 'pctBar character missing');
  });

  it('renders multiple flags + delta vs base', () => {
    const current = {
      flags: [
        {
          name: 'ui',
          lines_pct: 84.32,
          branches_pct: 71.18,
          statements_pct: 84.3,
          functions_pct: 88.1,
          files_count: 100,
          missing_lines_count: 100,
          top_uncovered_files: [],
        },
        {
          name: 'ios',
          lines_pct: 62.0,
          branches_pct: null,
          statements_pct: null,
          functions_pct: null,
          files_count: 50,
          missing_lines_count: 50,
          top_uncovered_files: [],
        },
      ],
    };
    const baseline = {
      flags: [
        {
          name: 'ui',
          lines_pct: 84.0,
          branches_pct: 71.0,
          statements_pct: 84.0,
          functions_pct: 88.0,
          files_count: 100,
          missing_lines_count: 100,
          top_uncovered_files: [],
        },
        {
          name: 'ios',
          lines_pct: 60.0,
          branches_pct: null,
          statements_pct: null,
          functions_pct: null,
          files_count: 50,
          missing_lines_count: 50,
          top_uncovered_files: [],
        },
      ],
    };
    const out = runFormat(current, baseline);
    assert.ok(out.includes('| `ui` |'), 'ui flag row missing');
    assert.ok(out.includes('| `ios` |'), 'ios flag row missing');
    assert.ok(out.includes('▴ +'), 'positive delta arrow missing');
  });

  it('renders ❌ verdict when overall is below threshold', () => {
    const out = runFormat({
      flags: [
        {
          name: 'ui',
          lines_pct: 50,
          branches_pct: null,
          statements_pct: null,
          functions_pct: null,
          files_count: 10,
          missing_lines_count: 10,
          top_uncovered_files: [],
        },
      ],
    });
    assert.ok(out.includes('## ❌ Coverage:'), 'fail verdict missing');
    assert.ok(out.includes('70%'), 'threshold reference missing');
  });

  it('renders top-uncovered-files collapsible when files have missing lines', () => {
    const out = runFormat({
      flags: [
        {
          name: 'ui',
          lines_pct: 84,
          branches_pct: 71,
          statements_pct: 84,
          functions_pct: 88,
          files_count: 2,
          missing_lines_count: 50,
          top_uncovered_files: [
            { path: 'src/foo.ts', lines_pct: 20, missing: 40 },
            { path: 'src/bar.ts', lines_pct: 80, missing: 10 },
          ],
        },
      ],
    });
    assert.ok(out.includes('<details>'), 'collapsible missing');
    assert.ok(out.includes('Top 2 files with most missing lines'));
    assert.ok(out.includes('`src/foo.ts`'));
    assert.ok(out.includes('40 lines'));
  });

  it('marks 🆕 for a flag without a baseline match', () => {
    const out = runFormat(
      {
        flags: [
          {
            name: 'newsuite',
            lines_pct: 90,
            branches_pct: 80,
            statements_pct: 90,
            functions_pct: 95,
            files_count: 5,
            missing_lines_count: 5,
            top_uncovered_files: [],
          },
        ],
      },
      { flags: [] },
    );
    assert.ok(out.includes('🆕'), 'new-flag marker missing');
  });
});
