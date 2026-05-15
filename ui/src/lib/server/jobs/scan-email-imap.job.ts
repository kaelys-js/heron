/**
 * Gmail IMAP poller — wraps `scan-email-imap.mjs`.
 *
 * Runs every 30 minutes via a tiny setInterval daemon kicked off at boot
 * (see `installImapPollerDaemon` below). The daemon checks the gmail-imap
 * source state on every tick and only spawns the script when connected,
 * so disconnected installs pay zero cost.
 *
 * Why a setInterval instead of an autopilot Schedule entry: the autopilot
 * scheduler is daily-tick-based and was designed for once-per-day tasks.
 * Real-time mail polling needs a cadence the scheduler doesn't model
 * cleanly. A 30-min setInterval is ~30 lines and keeps the autopilot
 * system focused on its happy path.
 *
 * Args:
 *   { dryRun?: boolean }     — pass --dry-run, no writes, no Seen-marking
 *   { keepUnread?: boolean } — process but don't mark Seen (for testing)
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent, reportServerError } from '../events';
import { register, runById, has as hasJob } from './registry';
import { recordSuccess, recordFailure, getSource } from '../sources';
import type { JobArgs, JobResult } from './types';

const FOUND_RE = /Total jobs found:\s+(\d+)/i;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min

function runScanEmailImap(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const state = getSource('gmail-imap');
    if (!state.connected) {
      resolve({
        ok: false,
        error: 'Gmail IMAP not connected — Connect from /sources to enable this scanner',
      });
      return;
    }

    const cliArgs = ['scripts/scan/scan-email-imap.mjs'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (args?.dryRun === true) cliArgs.push('--dry-run');
    if (args?.keepUnread === true) cliArgs.push('--keep-unread');

    let stdout = '';
    let stderr = '';
    logEvent('scan-email-imap', 'Gmail poll started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'unread-since-14d',
    });

    const p = spawn('node', cliArgs, { cwd: ROOT, env: { ...process.env } });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => {
      recordFailure('gmail-imap', err);
      logEvent('scan-email-imap', 'Failed to spawn scan-email-imap.mjs', {
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
        recordFailure('gmail-imap', new Error(tail || 'exit ' + code));
        logEvent('scan-email-imap', 'Gmail poll failed', {
          level: 'error',
          category: 'task',
          message: 'exit ' + code + (tail ? ' · ' + tail : ''),
        });
        resolve({ ok: false, error: 'exit ' + code });
        return;
      }
      recordSuccess('gmail-imap');
      logEvent('scan-email-imap', 'Gmail poll finished · ' + found + ' new', {
        level: 'success',
        category: 'task',
        message: 'IMAP session healthy',
      });
      resolve({ ok: true, message: found + ' new offers', meta: { found } });
    });
  });
}

register({
  id: 'scan-email-imap',
  label: 'Gmail IMAP poll',
  description:
    'Polls Gmail every 30 min for LinkedIn / Indeed / digest job-alert emails. Marks processed messages as Seen.',
  category: 'discovery',
  trigger: { type: 'manual' }, // scheduling handled by the daemon below
  allowManual: true,
  run: runScanEmailImap,
});

// ── Daemon ─────────────────────────────────────────────────────────────
//
// installImapPollerDaemon() kicks off a 30-min setInterval when the
// jobs/index.ts barrel imports this file. Idempotent — multiple imports
// (e.g. Vite HMR re-running module init) clear the prior timer first.

let pollerHandle: ReturnType<typeof setInterval> | null = null;

function tickOnce(): void {
  // Bail fast when the source isn't connected — the user can connect
  // anytime and the next tick picks it up.
  if (!getSource('gmail-imap').connected) return;
  if (!hasJob('scan-email-imap')) return;
  runById('scan-email-imap').catch((err) => {
    reportServerError('scan-email-imap', 'Daemon poll rejected', err, { category: 'task' });
  });
}

export function installImapPollerDaemon(): void {
  // Belt-and-braces idempotence: clear any prior handle on re-install.
  if (pollerHandle) {
    try {
      clearInterval(pollerHandle);
    } catch {
      // Already cleared or handle no longer valid — no-op on idempotent reinstall.
    }
    pollerHandle = null;
  }
  // Run a first poll 60s after boot (don't block boot itself), then
  // every 30 min thereafter.
  setTimeout(tickOnce, 60_000);
  pollerHandle = setInterval(tickOnce, POLL_INTERVAL_MS);
  // Don't keep the event loop alive solely for this timer — pairs well
  // with the spawn-cleanup handlers in orchestrator.ts.
  pollerHandle.unref?.();
}

// Auto-install when the module is first imported (jobs/index.ts barrel).
installImapPollerDaemon();

// D24 — `runScanEmailImap` was only used by the registry; export removed.
