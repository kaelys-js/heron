/**
 * Unit tests for format-security.mjs.
 * Run: node --test .github/scripts/sticky/format-security.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-security.mjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-sec-'));
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

describe('format-security', () => {
  it('renders skip-style message when no scanners are provided', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    assert.ok(out.includes('Security: no scanners ran'), 'no-scanners title missing');
    assert.ok(out.includes('No security scan outputs provided'), 'no-scanners explanation missing');
  });

  it('renders pass verdict when CodeQL has no critical/high', () => {
    const out = runFormat({
      codeql: {
        runs: [
          {
            results: [
              { level: 'note' },
              { properties: { 'security-severity': '3.5' } }, // medium
            ],
          },
        ],
      },
    });
    assert.ok(out.includes('## ✅ Security: no critical or high alerts'), 'pass verdict missing');
    assert.ok(out.includes('`CodeQL`'), 'CodeQL row missing');
  });

  it('renders fail verdict when CodeQL critical detected', () => {
    const out = runFormat({
      codeql: {
        runs: [
          {
            results: [
              { properties: { 'security-severity': '9.5' } }, // critical
              { properties: { 'security-severity': '8.0' } }, // high
            ],
          },
        ],
      },
    });
    assert.ok(out.includes('## ❌ Security:'), 'fail verdict missing');
    assert.ok(out.includes('2 critical/high alert'), 'critical+high count missing');
  });

  it('counts only OPEN Dependabot alerts', () => {
    const out = runFormat({
      dependabot: [
        { state: 'open', security_vulnerability: { severity: 'high' } },
        { state: 'fixed', security_vulnerability: { severity: 'critical' } },
        { state: 'dismissed', security_vulnerability: { severity: 'high' } },
        { state: 'open', security_vulnerability: { severity: 'low' } },
      ],
    });
    assert.ok(out.includes('`Dependabot`'), 'Dependabot row missing');
    // Should show 1 high, 0 critical, 1 low.
    assert.ok(out.includes('## ❌'), 'fail verdict expected with 1 high');
  });

  it('aggregates Trivy vulnerabilities by severity', () => {
    const out = runFormat({
      trivy: {
        Results: [
          {
            Vulnerabilities: [
              { Severity: 'CRITICAL' },
              { Severity: 'MEDIUM' },
              { Severity: 'LOW' },
            ],
          },
        ],
      },
    });
    assert.ok(out.includes('`Trivy`'), 'Trivy row missing');
    assert.ok(out.includes('## ❌'), 'fail verdict missing');
  });

  it('combines all three sources into one table', () => {
    const out = runFormat({
      codeql: { runs: [{ results: [] }] },
      dependabot: [],
      trivy: { Results: [] },
    });
    assert.ok(out.includes('`CodeQL`'));
    assert.ok(out.includes('`Dependabot`'));
    assert.ok(out.includes('`Trivy`'));
    assert.ok(out.includes('## ✅ Security: no critical or high alerts'));
  });

  it('handles unknown / empty severity gracefully', () => {
    const out = runFormat({
      trivy: { Results: [{ Vulnerabilities: [{ Severity: 'UNKNOWN' }] }] },
    });
    assert.ok(out.includes('`Trivy`'), 'Trivy row should still render');
  });
});
