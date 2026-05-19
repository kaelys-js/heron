/**
 * GET  /api/linkedin/audit
 *   → return the last-saved audit report (or null when never run)
 *
 * POST /api/linkedin/audit
 *   → spawn `linkedin-audit.py`, classify the snapshot, persist the
 *     report, return it. Long-running -- Playwright over LinkedIn pages
 *     takes 30-90s. Caller should show a spinner.
 *
 * The body of POST accepts:
 *   { headed?: boolean }   -- pass true for the one-time login session
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { logEvent, reportServerError } from '$lib/server/events';
import { userContextEnv } from '$lib/server/user-context';
import {
  readAuditReport,
  writeAuditReport,
  classifySnapshot,
  type LinkedInAuditReport,
} from '$lib/server/linkedin-audit';

const TIMEOUT_MS = 240_000;

export const GET = wrap('linkedin-audit', async () => {
  const report = readAuditReport();
  return { ok: true, report: report ?? null };
});

function pythonBin(): string {
  // Use the venv's interpreter when present; fall back to system python3.
  const candidate = path.join(ROOT, '.venv', 'bin', 'python');
  return candidate;
}

function runScraper(headed: boolean): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const args = [path.join(ROOT, 'scripts/linkedin/linkedin-audit.py'), '--json'];
    if (headed) args.push('--headed');
    const p = spawn(pythonBin(), args, {
      cwd: ROOT,
      env: userContextEnv(),
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('linkedin-audit.py timeout after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ stdout, stderr, code: code ?? 0 });
    });
  });
}

export const POST = wrap('linkedin-audit', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { headed?: boolean };
  try {
    const { stdout, stderr, code } = await runScraper(!!body.headed);
    if (code === 1) {
      return {
        ok: false,
        error:
          'LinkedIn session expired. POST /api/linkedin/audit with { headed: true } once to log in.',
      };
    }
    if (code === 3) {
      return { ok: false, error: 'Playwright spawn failed. Check .venv has playwright installed.' };
    }
    const snapshot = JSON.parse(stdout) as Record<string, unknown>;
    const findings = classifySnapshot(snapshot);
    const open = findings.filter((f) => !f.resolvedAt).length;
    const report: LinkedInAuditReport = {
      auditedAt: Date.now(),
      snapshot,
      findings,
      grade:
        findings.length === 0
          ? 100
          : Math.round(((findings.length - open) / findings.length) * 100),
    };
    writeAuditReport(report);
    logEvent('linkedin-audit', findings.length + ' findings · grade ' + report.grade, {
      level: open === 0 ? 'success' : open > 5 ? 'warn' : 'info',
      category: 'user',
      message:
        findings.filter((f) => f.severity === 'error').length +
        ' errors · ' +
        findings.filter((f) => f.severity === 'warn').length +
        ' warns',
    });
    if (stderr) {
      reportServerError(
        'linkedin-audit',
        'scraper emitted stderr',
        new Error(stderr.slice(0, 200)),
      );
    }
    return { ok: true, report };
  } catch (err) {
    reportServerError('linkedin-audit', 'audit failed', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
