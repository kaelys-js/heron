/** Authenticated LinkedIn scrape -- wraps `scan-linkedin-auth.py`. Uses
 *  the per-user Playwright session at data/users/{uid}/.playwright-linkedin/
 *  (saved by the Connect LinkedIn flow on /sources). recordSuccess /
 *  recordFailure drive the /sources health dot; 3 consecutive failures
 *  flip the source to Disconnected and prompt Reconnect.
 *  Schedule: weekdays 09:15 -- 15 min after scan-all fan-out.
 *  Args: { dryRun?, maxPages? (default 25), query? (single-keyword override) }. */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import { recordSuccess, recordFailure, getSource } from '../sources';
import type { JobArgs, JobResult } from './types';
import { userContextEnv } from '../user-context';

const FOUND_RE = /Total jobs found:\s+(\d+)/i;

function runScanLinkedinAuth(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    // Don't bother spawning if the user hasn't connected LinkedIn yet --
    // the script would just exit 2 (which is correct behaviour but noisy).
    const state = getSource('linkedin-auth');
    if (!state.connected) {
      resolve({
        ok: false,
        error: 'LinkedIn not connected — Connect from /sources to enable this scanner',
      });
      return;
    }

    const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
    const py = fs.existsSync(venvPython) ? venvPython : 'python3';

    const cliArgs = ['scripts/scan/scan-linkedin-auth.py'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (args?.dryRun === true) cliArgs.push('--dry-run');
    if (typeof args?.maxPages === 'number' && args.maxPages > 0) {
      cliArgs.push('--max-pages', String(Math.floor(args.maxPages)));
    }
    if (typeof args?.query === 'string' && args.query.trim()) {
      cliArgs.push('--query', args.query.trim());
    }

    let stdout = '';
    let stderr = '';
    logEvent('scan-linkedin-auth', 'Authenticated LinkedIn scrape started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'profile-derived queries',
    });

    const p = spawn(py, cliArgs, { cwd: ROOT, env: userContextEnv() });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => {
      recordFailure('linkedin-auth', err);
      logEvent('scan-linkedin-auth', 'Failed to spawn', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      const found = parseInt(stdout.match(FOUND_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        const tail = (stderr || stdout).slice(-300).trim();
        const reason =
          code === 3
            ? 'session expired'
            : tail.toLowerCase().includes('captcha')
              ? 'captcha'
              : 'exit ' + code;
        recordFailure('linkedin-auth', new Error(reason));
        logEvent('scan-linkedin-auth', 'Scrape failed · ' + reason, {
          level: 'error',
          category: 'task',
          message: tail || 'no stderr',
        });
        resolve({ ok: false, error: reason });
        return;
      }
      recordSuccess('linkedin-auth');
      logEvent('scan-linkedin-auth', 'Scrape finished · ' + found + ' new', {
        level: 'success',
        category: 'task',
        message: 'Authenticated session healthy',
      });
      resolve({ ok: true, message: found + ' new offers', meta: { found } });
    });
  });
}

register({
  id: 'scan-linkedin-auth',
  label: 'LinkedIn (authenticated)',
  description:
    "Headless Playwright scrape using your saved LinkedIn session. Captures personalized recommendations + Easy Apply listings JobSpy can't see.",
  category: 'discovery',
  trigger: { type: 'daily', hour: 9, minute: 15, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  perUser: true,
  run: runScanLinkedinAuth,
});

// D24 -- `runScanLinkedinAuth` was only used by the registry; export removed.
