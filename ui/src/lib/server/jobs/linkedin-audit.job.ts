/**
 * linkedin-audit-job — weekly background re-audit of LinkedIn profile +
 * account settings.
 *
 * LinkedIn changes layout often (and recruiter algorithms re-rank
 * silently). A weekly re-run catches drift between the last fix and
 * today. Findings filed as Inbox cards via `reportIssue` with dedupeKey
 * `linkedin-audit:{kind}` so the cards don't pile up across runs.
 *
 * Trigger: weekly Monday 07:00. Manual run also allowed.
 *
 * Runs ONLY for the active profile (LinkedIn auth is per-user, not per-
 * profile — the same LinkedIn account serves all of a user's profiles).
 * Per-user Playwright session dirs are at data/users/{uid}/.playwright-linkedin/.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { register } from './registry';
import type { JobResult } from './types';
import { ROOT } from '../files';
import { classifySnapshot, writeAuditReport } from '../linkedin-audit';
import { reportIssue } from '../issues';
import { logEvent, reportServerError } from '../events';

const TIMEOUT_MS = 240_000;

function pythonBin(): string {
  const candidate = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : 'python3';
}

function runScraper(): Promise<{ stdout: string; code: number }> {
  return new Promise((resolveP) => {
    let stdout = '';
    const p = spawn(
      pythonBin(),
      [path.join(ROOT, 'scripts/linkedin/linkedin-audit.py'), '--json'],
      {
        cwd: ROOT,
        env: { ...process.env },
      },
    );
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* process already exited — kill races with the close event */
      }
      resolveP({ stdout, code: 124 });
    }, TIMEOUT_MS);
    p.on('error', () => {
      clearTimeout(timer);
      resolveP({ stdout, code: 1 });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ stdout, code: code ?? 0 });
    });
  });
}

async function runLinkedInAudit(): Promise<JobResult> {
  const { stdout, code } = await runScraper();
  if (code === 1) {
    reportIssue({
      severity: 'warn',
      source: 'linkedin-audit',
      summary: 'LinkedIn session expired — re-login required',
      detail:
        'Open /linkedin-audit and click "Log in to LinkedIn" to refresh the session, then the ' +
        'weekly audit will resume next run.',
      dedupeKey: 'linkedin-audit:session-expired',
      fix: { label: 'Open LinkedIn audit', href: '/linkedin-audit' },
    });
    return { ok: false, error: 'session-expired' };
  }
  if (code === 124) {
    return { ok: false, error: 'timeout' };
  }
  try {
    const snapshot = JSON.parse(stdout) as Record<string, unknown>;
    const findings = classifySnapshot(snapshot);
    const grade =
      findings.length === 0
        ? 100
        : Math.round(
            ((findings.length - findings.filter((f) => f.resolvedAt).length) / findings.length) *
              100,
          );
    writeAuditReport({
      auditedAt: Date.now(),
      snapshot,
      findings,
      grade,
    });
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warns = findings.filter((f) => f.severity === 'warn').length;
    logEvent('linkedin-audit', 'Weekly audit · grade ' + grade, {
      level: errors > 0 ? 'warn' : 'info',
      category: 'user',
      message: errors + ' errors · ' + warns + ' warnings',
    });
    if (errors > 0 || warns >= 3) {
      reportIssue({
        severity: errors > 0 ? 'warn' : 'info',
        source: 'linkedin-audit',
        summary:
          'LinkedIn audit · ' +
          errors +
          ' errors · ' +
          warns +
          ' warnings · grade ' +
          grade +
          '/100',
        detail: 'Open /linkedin-audit for the full report + paste-ready fixes.',
        dedupeKey: 'linkedin-audit:weekly',
        fix: { label: 'Review findings', href: '/linkedin-audit' },
      });
    }
    return {
      ok: true,
      message: 'grade ' + grade + ' · ' + errors + ' errors · ' + warns + ' warns',
      meta: { grade, errors, warns, findings: findings.length },
    };
  } catch (err) {
    reportServerError('linkedin-audit', 'parse failure', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

register({
  id: 'linkedin-audit',
  label: 'LinkedIn profile + account audit',
  description:
    'Weekly Playwright scrape of profile + settings + activity. Files findings + paste-ready fixes.',
  category: 'hygiene',
  trigger: { type: 'weekly', dayOfWeek: 1, hour: 7, minute: 0 },
  allowManual: true,
  run: runLinkedInAudit,
});
