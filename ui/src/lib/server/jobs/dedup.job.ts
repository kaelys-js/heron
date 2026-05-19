/**
 * Tracker dedup -- silent hygiene job.
 *
 * Runs `dedup-tracker.mjs` to merge same-URL duplicates in applications.md.
 * The script keeps the highest-scored row, merges notes, and writes a backup.
 *
 * Trigger: after every successful 'batch-merge' event (the auto-merge
 * fs watcher in `auto-merge-batch.ts` emits these). Manual run via the
 * Agents page Run button OR via
 * `POST /api/jobs/dedup-tracker/run` (same code path as the Agents page).
 *
 * Activity feed: silent unless ≥1 row was actually removed. Stdout parsed
 * for the "📊 N duplicates removed" summary line.
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import { userContextEnv } from '../user-context';
import type { JobResult } from './types';

const COUNT_RE = /(\d+)\s+duplicates?\s+removed/i;

function runDedupTracker(): Promise<JobResult> {
  return new Promise((resolve) => {
    let stdout = '';
    const p = spawn('node', ['scripts/tracker/dedup-tracker.mjs'], {
      cwd: ROOT,
      // userContextEnv injects HERON_USER_ID so the script
      // resolves the right data/users/{uid}/profiles/{slug}/applications.md
      // tree (F13).
      env: userContextEnv(),
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', () => {
      /* swallow */
    });
    p.on('error', (err: Error) => {
      logEvent('dedup-tracker', 'Dedup failed to spawn', {
        level: 'error',
        category: 'system',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code: number | null) => {
      if (code !== 0) {
        resolve({ ok: false, error: 'dedup exited with code ' + code });
        return;
      }
      const m = stdout.match(COUNT_RE);
      const count = m ? parseInt(m[1], 10) : 0;
      if (count > 0) {
        logEvent('dedup-tracker', 'Merged ' + count + ' duplicate' + (count === 1 ? '' : 's'), {
          level: 'info',
          category: 'application',
          message: 'Hygiene sweep — applications.md self-healed',
        });
      }
      resolve({ ok: true, message: 'Removed ' + count, meta: { count } });
    });
  });
}

register({
  id: 'dedup-tracker',
  label: 'Tracker dedup',
  description: 'Silent hygiene sweep that merges same-URL duplicate rows in applications.md.',
  category: 'hygiene',
  trigger: { type: 'after', tasks: ['batch-merge'] },
  allowManual: true,
  perUser: true,
  run: runDedupTracker,
});
