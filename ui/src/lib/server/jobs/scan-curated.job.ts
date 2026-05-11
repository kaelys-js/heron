/**
 * Curated-board scan — wraps `scan-curated.mjs`.
 *
 * scan-curated handles niche boards that don't expose a public ATS API
 * and aren't covered by JobSpy or scan.mjs. Currently: AI Jobs (aijobs.net).
 * Output schema is identical to scan.mjs so dedup + pipeline.md stay
 * unified.
 *
 * Args:
 *   { source: string }  — only one source ('aijobs')
 *   { pages: number }   — max pages per source (default: walks until empty)
 *   { dryRun: boolean }
 *
 * Schedule: weekdays 08:30 (30 min after the portal scan, to spread the
 * load and let the ATS scan finish before the title filters cross-check).
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import { recordSuccess, recordFailure } from '../sources';
import type { JobArgs, JobResult } from './types';

const FOUND_RE = /New offers:\s+(\d+)/i;

function runScanCurated(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const cliArgs = ['scan-curated.mjs'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (typeof args?.source === 'string' && args.source.trim()) {
      cliArgs.push('--source', args.source.trim());
    }
    if (typeof args?.pages === 'number' && args.pages > 0) {
      cliArgs.push('--pages', String(Math.floor(args.pages)));
    }
    if (args?.dryRun === true) cliArgs.push('--dry-run');

    let stdout = '';
    let stderr = '';
    logEvent('scan-curated', 'Curated scan started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'all curated sources',
    });
    const p = spawn('node', cliArgs, { cwd: ROOT, env: { ...process.env } });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => {
      logEvent('scan-curated', 'scan-curated.mjs failed to spawn', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      try { recordFailure('scan-curated', err); } catch {}
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      const found = parseInt(stdout.match(FOUND_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        logEvent('scan-curated', 'Curated scan failed', {
          level: 'error',
          category: 'task',
          message: 'exit ' + code + (stderr ? ' · ' + stderr.slice(0, 150) : ''),
        });
        try { recordFailure('scan-curated', new Error('scan-curated.mjs exited ' + code)); } catch {}
        resolve({ ok: false, error: 'scan-curated.mjs exited ' + code });
        return;
      }
      logEvent('scan-curated', 'Curated scan finished', {
        level: 'success',
        category: 'task',
        message: found + ' new offers',
      });
      try { recordSuccess('scan-curated'); } catch {}
      resolve({ ok: true, message: found + ' new offers', meta: { found } });
    });
  });
}

register({
  id: 'scan-curated',
  label: 'Curated boards scan',
  description: 'AI Jobs + future niche boards. Free, HTML scrapes only — title-filtered before write.',
  category: 'discovery',
  // 08:30 — 30 min after the portal scan so dedup catches the ATS rows first
  trigger: { type: 'daily', hour: 8, minute: 30, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  run: runScanCurated,
});

// D24 — `runScanCurated` was only used by the registry; export removed.
