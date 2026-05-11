/**
 * Email-alert ingestion — wraps `scan-email.mjs`.
 *
 * Reads .mbox files from data/inbox-mbox/ (Google Takeout output for the
 * user's job-alert label) and parses LinkedIn / Indeed alert URLs into
 * the unified pipeline.
 *
 * Trigger: manual only by default. Email ingestion is event-driven (a
 * new mbox just landed) rather than time-driven, and there's nothing to
 * gain by polling an empty inbox-mbox/ folder on a schedule.
 *
 * Args:
 *   { dryRun: boolean }
 *   { keep: boolean }   — don't move processed files
 *   { file: string }    — process a single explicit path
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import type { JobArgs, JobResult } from './types';

const FOUND_RE = /New offers:\s+(\d+)/i;

function runScanEmail(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const cliArgs = ['scan-email.mjs'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (args?.dryRun === true) cliArgs.push('--dry-run');
    if (args?.keep === true) cliArgs.push('--keep');
    if (typeof args?.file === 'string' && args.file.trim()) {
      cliArgs.push('--file', args.file.trim());
    }

    let stdout = '';
    let stderr = '';
    logEvent('scan-email', 'Email ingestion started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'data/inbox-mbox/',
    });
    const p = spawn('node', cliArgs, { cwd: ROOT, env: { ...process.env } });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => {
      logEvent('scan-email', 'scan-email.mjs failed to spawn', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      const found = parseInt(stdout.match(FOUND_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        logEvent('scan-email', 'Email ingestion failed', {
          level: 'error',
          category: 'task',
          message: 'exit ' + code + (stderr ? ' · ' + stderr.slice(0, 150) : ''),
        });
        resolve({ ok: false, error: 'scan-email.mjs exited ' + code });
        return;
      }
      logEvent('scan-email', 'Email ingestion finished', {
        level: 'success',
        category: 'task',
        message: found + ' new offers from email',
      });
      resolve({ ok: true, message: found + ' new offers', meta: { found } });
    });
  });
}

register({
  id: 'scan-email',
  label: 'Email-alert ingestion (mbox)',
  description: 'Parses LinkedIn / Indeed job-alert emails from a Google Takeout mbox. Drop the file in data/inbox-mbox/ and run.',
  category: 'discovery',
  trigger: { type: 'manual' },
  allowManual: true,
  run: runScanEmail,
});

export { runScanEmail };
