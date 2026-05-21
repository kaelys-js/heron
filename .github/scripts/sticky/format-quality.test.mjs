/**
 * Unit tests for format-quality.mjs.
 * Run: node --test .github/scripts/sticky/format-quality.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-quality.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'format-q-'));
}

function runFormat(jobsPayload, opts = {}) {
  const dir = makeTmp();
  const jobsPath = path.join(dir, 'jobs.json');
  fs.writeFileSync(jobsPath, JSON.stringify(jobsPayload));
  const args = [SCRIPT, jobsPath];
  if (opts.repo) args.push('--repo', opts.repo);
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('format-quality', () => {
  it('renders pass verdict when all quality jobs succeed', () => {
    const out = runFormat({
      jobs: [
        {
          name: 'Lint + format (Python / Go / Kotlin / Shell / Ruby / YAML)',
          conclusion: 'success',
          started_at: '2026-05-21T17:00:00Z',
          completed_at: '2026-05-21T17:02:00Z',
        },
        {
          name: 'TS — typecheck + Vitest + coverage',
          conclusion: 'success',
          started_at: '2026-05-21T17:00:00Z',
          completed_at: '2026-05-21T17:03:30Z',
        },
      ],
    });
    assert.ok(out.includes('## ✅ Code quality: all checks pass'), 'pass verdict missing');
    assert.ok(out.includes('Lint + format'), 'lint job missing');
    assert.ok(out.includes('TS — typecheck'), 'typecheck job missing');
    assert.ok(out.includes('2m 0s'), 'duration missing');
  });

  it('renders fail verdict + failure-details collapsible when a job fails', () => {
    const out = runFormat({
      jobs: [
        {
          name: 'Lint + format (Python / Go / Kotlin / Shell / Ruby / YAML)',
          conclusion: 'failure',
          started_at: '2026-05-21T17:00:00Z',
          completed_at: '2026-05-21T17:02:00Z',
          steps: [
            { name: 'yamllint', conclusion: 'failure', number: 5 },
            { name: 'taplo format --check', conclusion: 'success', number: 6 },
          ],
        },
        { name: 'TS — typecheck + Vitest + coverage', conclusion: 'success' },
      ],
    });
    assert.ok(out.includes('## ❌ Code quality: 1 failing check'), 'fail verdict missing');
    assert.ok(out.includes('<details>'), 'failure details missing');
    assert.ok(out.includes('yamllint'), 'failed step name missing');
    assert.ok(out.includes('step #5'), 'step number missing');
  });

  it('sorts failures first', () => {
    const out = runFormat({
      jobs: [
        { name: 'A - lint', conclusion: 'success' },
        { name: 'Z - lint', conclusion: 'failure' },
        { name: 'M - lint', conclusion: 'success' },
      ],
    });
    const zPos = out.indexOf('Z - lint');
    const aPos = out.indexOf('A - lint');
    const mPos = out.indexOf('M - lint');
    assert.ok(zPos !== -1);
    assert.ok(zPos < aPos, 'failure should appear before success');
    assert.ok(zPos < mPos, 'failure should appear before all successes');
  });

  it('filters out non-quality jobs', () => {
    const out = runFormat({
      jobs: [
        { name: 'iOS — XCTest + XCUITest + Snapshot', conclusion: 'success' }, // not in keywords
        { name: 'Lint + format (...)', conclusion: 'success' },
      ],
    });
    assert.ok(!out.includes('iOS'), 'iOS job should be filtered out');
    assert.ok(out.includes('Lint + format'));
  });

  it('handles empty job list gracefully', () => {
    const out = runFormat({ jobs: [] });
    assert.ok(out.includes('No quality-related jobs found'));
  });
});
