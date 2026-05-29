/**
 * VC portfolio discovery -- wraps `scan-vc.mjs`.
 *
 * Different output shape from the other scanners: this writes a TSV of
 * candidate COMPANIES (a16z + Sequoia portfolio), not jobs. The user
 * reviews the TSV and manually adds entries to portals.yml.
 *
 * Schedule: weekly Monday 07:00. Portfolios change slowly; daily would
 * be wasteful and cluttery.
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import type { JobArgs, JobResult } from './types';
import { userContextEnv } from '../user-context';

const NEW_RE = /New candidates:\s+(\d+)/i;

function runScanVc(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const cliArgs = ['scripts/scan/scan-vc.mjs'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (typeof args?.source === 'string' && args.source.trim()) {
      cliArgs.push('--source', args.source.trim());
    }
    if (args?.dryRun === true) {
      cliArgs.push('--dry-run');
    }

    let stdout = '';
    let stderr = '';
    logEvent('scan-vc', 'VC discovery started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'all VC sources',
    });
    const p = spawn('node', cliArgs, { cwd: ROOT, env: userContextEnv() });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => {
      logEvent('scan-vc', 'scan-vc.mjs failed to spawn', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      const found = parseInt(stdout.match(NEW_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        logEvent('scan-vc', 'VC discovery failed', {
          level: 'error',
          category: 'task',
          message: `exit ${code}${stderr ? ' · ' + stderr.slice(0, 150) : ''}`,
        });
        resolve({ ok: false, error: `scan-vc.mjs exited ${code}` });
        return;
      }
      logEvent('scan-vc', 'VC discovery finished', {
        level: 'success',
        category: 'task',
        message: `${found} candidate companies — review the TSV in data/`,
      });
      resolve({ ok: true, message: `${found} candidates`, meta: { found } });
    });
  });
}

register({
  id: 'scan-vc',
  label: 'VC portfolio discovery',
  description:
    'a16z + Sequoia portfolio companies as a candidates TSV. Manual review before adding to portals.yml.',
  category: 'discovery',
  trigger: { type: 'weekly', dayOfWeek: 1, hour: 7, minute: 0 },
  allowManual: true,
  perUser: true,
  run: runScanVc,
});

// D24 -- `runScanVc` was only used by the registry; export removed.
