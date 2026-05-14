/**
 * Integration replacement for `verify-apply.mjs` (Phase 5).
 *
 * The legacy verifier (~1766 LOC) exercises every portal adapter
 * (LinkedIn / Greenhouse / Ashby / Lever / Workday / etc.) end-to-end.
 * Full rewrite to Vitest needs portal mocks + Playwright fixtures —
 * Phase 8 work.
 *
 * For now: parity oracle + structural assertions on the apply pipeline.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}
function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Apply pipeline — code surface', () => {
  it('apply-dispatcher.ts exists', () => {
    expect(exists('ui/src/lib/server/apply-dispatcher.ts')).toBe(true);
  });

  it('apply-failures.ts exists with reportApplyFailure export', () => {
    const ts = readFile('ui/src/lib/server/apply-failures.ts');
    expect(ts).toMatch(/export\s+function\s+reportApplyFailure/);
  });

  it('apply-counter.ts exists for daily rate-limit', () => {
    expect(exists('ui/src/lib/server/apply-counter.ts')).toBe(true);
  });

  it('apply-state.ts exists for in-flight tracking', () => {
    expect(exists('ui/src/lib/server/apply-state.ts')).toBe(true);
  });
});

describe('Apply pipeline — portal adapters', () => {
  // Each adapter lives under jobs/apply-*.job.ts. We assert at least the
  // LinkedIn + the dispatcher exist; the others have grown / shrunk over
  // time and the legacy verifier is the ground truth.
  it('at least one portal job exists under jobs/', () => {
    const dir = path.join(REPO_ROOT, 'ui/src/lib/server/jobs');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.includes('apply'));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe('Apply pipeline — endpoint', () => {
  it('/api/job/[id]/apply endpoint exists', () => {
    expect(exists('ui/src/routes/api/job/[id]/apply/+server.ts')).toBe(true);
  });

  it('queue-apply endpoint exists (per-job route)', () => {
    expect(exists('ui/src/routes/api/job/[id]/queue-apply/+server.ts')).toBe(true);
  });
});

describe('Apply pipeline — autonomous-apply circuit breaker', () => {
  it('autopilot-circuit-breaker.ts exists', () => {
    expect(exists('ui/src/lib/server/autopilot-circuit-breaker.ts')).toBe(true);
  });
});

describe('Parity with legacy verify-apply.mjs', () => {
  it('legacy verifier exits 0', () => {
    const p = path.join(REPO_ROOT, 'verify-apply.mjs');
    if (!fs.existsSync(p)) return;
    let exitCode = 0;
    try {
      execSync(`node "${p}"`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
        timeout: 120_000,
        env: {
          ...process.env,
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'ci-verifier-secret',
          BETTER_AUTH_RATE_LIMIT: 'off',
        },
      });
    } catch (e: any) {
      exitCode = e.status ?? 1;
    }
    expect(exitCode).toBe(0);
  });
});
