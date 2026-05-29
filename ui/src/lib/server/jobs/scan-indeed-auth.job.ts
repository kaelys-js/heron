/**
 * Authenticated Indeed scrape -- wraps `scan-indeed-auth.py`.
 *
 * Mirror of scan-linkedin-auth.job.ts. Indeed's anti-bot is heavier; the
 * script bails on first captcha (exit code 4) and recordFailure flips
 * the source state -- /sources surfaces "Indeed needs reconnection".
 *
 * Schedule: daily 09:30 weekdays -- 30 min after scan-all so LinkedIn's
 * fresh load is done first (Indeed has stricter rate limits).
 */

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

function runScanIndeedAuth(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const state = getSource('indeed-auth');
    if (!state.connected) {
      resolve({
        ok: false,
        error: 'Indeed not connected — Connect from /sources to enable this scanner',
      });
      return;
    }

    const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
    const py = fs.existsSync(venvPython) ? venvPython : 'python3';

    const cliArgs = ['scripts/scan/scan-indeed-auth.py'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (args?.dryRun === true) {
      cliArgs.push('--dry-run');
    }
    if (typeof args?.maxPages === 'number' && args.maxPages > 0) {
      cliArgs.push('--max-pages', String(Math.floor(args.maxPages)));
    }
    if (typeof args?.query === 'string' && args.query.trim()) {
      cliArgs.push('--query', args.query.trim());
    }

    let stdout = '';
    let stderr = '';
    logEvent('scan-indeed-auth', 'Authenticated Indeed scrape started', {
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
      recordFailure('indeed-auth', err);
      logEvent('scan-indeed-auth', 'Failed to spawn', {
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
            : code === 4
              ? 'captcha — re-login on /sources'
              : `exit ${code}`;
        recordFailure('indeed-auth', new Error(reason));
        logEvent('scan-indeed-auth', `Scrape failed · ${reason}`, {
          level: 'error',
          category: 'task',
          message: tail || 'no stderr',
        });
        resolve({ ok: false, error: reason });
        return;
      }
      recordSuccess('indeed-auth');
      logEvent('scan-indeed-auth', `Scrape finished · ${found} new`, {
        level: 'success',
        category: 'task',
        message: 'Authenticated session healthy',
      });
      resolve({ ok: true, message: `${found} new offers`, meta: { found } });
    });
  });
}

register({
  id: 'scan-indeed-auth',
  label: 'Indeed (authenticated)',
  description: 'Headless Playwright scrape using your saved Indeed session.',
  category: 'discovery',
  trigger: { type: 'daily', hour: 9, minute: 30, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  perUser: true,
  run: runScanIndeedAuth,
});

// D24 -- `runScanIndeedAuth` was only used by the registry; export removed.
