/**
 * Zero-token portal scan — sister to scan-broad.py.
 *
 * Wraps `scan.mjs` (direct Greenhouse/Ashby/Lever/Workable API hits with no
 * scraping or LLM cost). Faster (~30s) and free; complementary to the full
 * JobSpy-based scrape that runs as 'scan'.
 *
 * Args:
 *   { company: string }   — narrow to a single company (passes --company)
 *   { dryRun: boolean }   — pass --dry-run, no writes
 *   default               — scan every company in portals.yml
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import type { JobArgs, JobResult } from './types';

const FOUND_RE = /Total jobs found:\s+(\d+)/i;

function runScanPortals(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const cliArgs = ['scan.mjs'];
    if (typeof args?.company === 'string' && args.company.trim()) {
      cliArgs.push('--company', args.company.trim());
    }
    if (args?.dryRun === true) cliArgs.push('--dry-run');

    let stdout = '';
    let stderr = '';
    logEvent('scan-portals', 'Portal scan started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'all companies',
    });
    const p = spawn('node', cliArgs, {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => {
      logEvent('scan-portals', 'scan.mjs failed to spawn', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      const found = parseInt(stdout.match(FOUND_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        logEvent('scan-portals', 'Portal scan failed', {
          level: 'error',
          category: 'task',
          message: 'exit ' + code + (stderr ? ' · ' + stderr.slice(0, 150) : ''),
        });
        resolve({ ok: false, error: 'scan.mjs exited ' + code });
        return;
      }
      logEvent('scan-portals', 'Portal scan finished', {
        level: 'success',
        category: 'task',
        message: found + ' jobs found',
      });
      resolve({ ok: true, message: found + ' jobs found', meta: { found } });
    });
  });
}

register({
  id: 'scan-portals',
  label: 'Portal scan (zero-token)',
  description: 'Direct Greenhouse / Ashby / Lever / Workable API hits — free, ~30s, complements the broad scan.',
  category: 'discovery',
  trigger: { type: 'daily', hour: 8, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  run: runScanPortals,
});

// Re-export for use by /api/scan/company (Phase 2.2 — calls runScanPortals
// with { company } arg).
export { runScanPortals };
