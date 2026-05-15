/**
 * Status normalization — silent hygiene job.
 *
 * Runs `normalize-statuses.mjs` to clean non-canonical states in
 * applications.md (DUPLICADO → Discarded, strip markdown bold from status,
 * map Spanish → canonical English statuses, etc.).
 *
 * Triggers (match the `source` field of upstream success events):
 *   - 'status'      — every /api/status POST emits a success event
 *   - 'batch-merge' — emitted by the auto-merge fs watcher (`auto-merge-batch.ts`)
 *   - 'boot'        — emitted by bootOnce when the dev server is fully up
 *
 * Activity feed: silent unless ≥1 row was actually changed. The script's
 * stdout is parsed for the "📊 N statuses normalized" line.
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import type { JobResult } from './types';

const COUNT_RE = /(\d+)\s+statuses?\s+normalized/i;

function runNormalize(): Promise<JobResult> {
  return new Promise((resolve) => {
    let stdout = '';
    const p = spawn('node', ['scripts/tracker/normalize-statuses.mjs'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', () => {
      /* swallow — non-fatal */
    });
    p.on('error', (err: Error) => {
      logEvent('normalize', 'Normalize failed to spawn', {
        level: 'error',
        category: 'system',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code: number | null) => {
      if (code !== 0) {
        // Non-zero exit isn't a hard error here — script may have nothing to do
        resolve({ ok: false, error: 'normalize exited with code ' + code });
        return;
      }
      const m = stdout.match(COUNT_RE);
      const count = m ? parseInt(m[1], 10) : 0;
      if (count > 0) {
        logEvent('normalize', 'Normalized ' + count + ' status' + (count === 1 ? '' : 'es'), {
          level: 'info',
          category: 'application',
          message: 'Hygiene sweep — applications.md self-corrected',
        });
      }
      resolve({ ok: true, message: 'Normalized ' + count, meta: { count } });
    });
  });
}

register({
  id: 'normalize',
  label: 'Status normalization',
  description:
    'Silent hygiene sweep that maps non-canonical statuses (DUPLICADO, etc.) to canonical ones.',
  category: 'hygiene',
  trigger: { type: 'after', tasks: ['status', 'batch-merge', 'boot'] },
  allowManual: true,
  run: runNormalize,
});
