/**
 * Pipeline integrity verification — silent + on-demand.
 *
 * Wraps `verify-pipeline.mjs` (text output today). We run nightly at 04:00
 * and also expose a manual run via the Agents page (and the equivalent
 * `POST /api/jobs/verify-pipeline/run`). Output is parsed into the issue
 * stream so the user only sees a notification when something is actually
 * broken.
 *
 * Issue strategy: ONE issue per problem class with a stable dedupeKey, so
 * repeat detections refresh the existing row rather than spamming. Closing
 * an issue (resolveIssue) lets it re-appear next sweep if the data is still
 * broken — that's the desired "won't go away until you actually fix it"
 * behaviour.
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { reportIssue } from '../issues';
import { register } from './registry';
import type { JobResult } from './types';

const SUMMARY_RE = /Pipeline Health:\s*(\d+)\s+errors?,\s*(\d+)\s+warnings?/i;

type Finding = { severity: 'error' | 'warn'; line: string };

function parseFindings(stdout: string): Finding[] {
  const out: Finding[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('❌')) out.push({ severity: 'error', line: line.replace(/^❌\s*/, '') });
    else if (line.startsWith('⚠️')) out.push({ severity: 'warn', line: line.replace(/^⚠️\s*/, '') });
  }
  return out;
}

/** Group findings by their leading "<problem class>:" prefix or first 5 words. */
function classify(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    // Strip the "#NUM:" prefix and use the next token as the class
    const stripped = f.line.replace(/^#\d+:\s*/, '');
    const m = stripped.match(/^([^:]+):/);
    const cls = (m ? m[1] : stripped.split(/\s+/).slice(0, 4).join(' ')).trim();
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(f);
  }
  return groups;
}

function runVerifyPipeline(): Promise<JobResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const p = spawn('node', ['verify-pipeline.mjs'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err: Error) => {
      logEvent('verify-pipeline', 'verify-pipeline.mjs failed to spawn', {
        level: 'error',
        category: 'system',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code: number | null) => {
      const m = stdout.match(SUMMARY_RE);
      const errors = m ? parseInt(m[1], 10) : 0;
      const warnings = m ? parseInt(m[2], 10) : 0;
      const findings = parseFindings(stdout);
      const groups = classify(findings);

      // Emit one issue per problem class. dedupeKey = source+class so repeat
      // sweeps refresh the same row rather than appending.
      for (const [cls, items] of groups) {
        const errCount = items.filter((i) => i.severity === 'error').length;
        const warnCount = items.length - errCount;
        const severity: 'error' | 'warn' = errCount > 0 ? 'error' : 'warn';
        const summary =
          cls + ' (' +
          (errCount > 0 ? errCount + ' error' + (errCount === 1 ? '' : 's') : '') +
          (errCount > 0 && warnCount > 0 ? ' · ' : '') +
          (warnCount > 0 ? warnCount + ' warning' + (warnCount === 1 ? '' : 's') : '') +
          ')';
        const detail = items.slice(0, 50).map((i) => '- ' + i.line).join('\n') +
          (items.length > 50 ? '\n\n…and ' + (items.length - 50) + ' more.' : '');
        reportIssue({
          severity,
          source: 'verify-pipeline',
          summary,
          detail,
          fix: { label: 'Open Settings → Maintenance', href: '/settings#maintenance' },
          dedupeKey: 'verify-pipeline:' + cls.toLowerCase().replace(/\s+/g, '-'),
        });
      }

      // Activity feed: silent if all-clear; warn level otherwise.
      if (errors === 0 && warnings === 0) {
        logEvent('verify-pipeline', 'Pipeline integrity OK', {
          level: 'info',
          category: 'system',
          message: 'No issues found',
        });
      } else {
        logEvent(
          'verify-pipeline',
          'Pipeline issues: ' + errors + ' error' + (errors === 1 ? '' : 's') + ' · ' + warnings + ' warning' + (warnings === 1 ? '' : 's'),
          {
            level: errors > 0 ? 'warn' : 'info',
            category: 'system',
            message: 'See Inbox · Maintenance for details',
          },
        );
      }
      // Exit code is non-zero when issues found — we treat that as "ran
      // successfully and reported", not as a failure of the job itself.
      if (code === null && stderr.trim()) {
        resolve({ ok: false, error: 'verify-pipeline killed: ' + stderr.slice(0, 200) });
      } else {
        resolve({
          ok: true,
          message: 'Verified · ' + errors + ' errors / ' + warnings + ' warnings',
          meta: { errors, warnings, exitCode: code, stderr: stderr.slice(0, 500) },
        });
      }
    });
  });
}

register({
  id: 'verify-pipeline',
  label: 'Pipeline integrity check',
  description: 'Validates statuses, dedupes, and report links across applications.md. Surfaces problems via the issue stream.',
  category: 'hygiene',
  trigger: { type: 'daily', hour: 4, minute: 0 },
  allowManual: true,
  run: runVerifyPipeline,
});
