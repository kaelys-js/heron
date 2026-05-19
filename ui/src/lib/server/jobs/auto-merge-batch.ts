/**
 * Auto-merge batch additions — fs watcher.
 *
 * The batch runner (`scripts/batch/batch-runner.sh`) writes one TSV per
 * evaluated job into the active profile's `batch/tracker-additions/`.
 * Today the user must run
 * `node merge-tracker.mjs` by hand. This watcher does it automatically,
 * debouncing so multiple TSVs landing in quick succession trigger only one
 * merge-tracker invocation.
 *
 * After a successful merge:
 *   - merge-tracker itself moves consumed TSVs to `tracker-additions/merged/`
 *     so we don't reprocess them
 *   - We emit a synthetic 'batch-merge' success event so normalize + dedup
 *     hygiene jobs chain via the after-trigger listener
 *   - Issue stream gets a row if anything looked malformed
 *
 * Boot path: also runs once at startup so any TSVs that landed while the
 * dev server was down get caught up.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { reportIssue } from '../issues';
import { register } from './registry';
import type { JobResult } from './types';

// Resolved lazily so a profile-switch (rare today but legal) is picked
// up the next time the watcher restarts. The watcher itself is rebound
// in startAutoMergeBatch() each boot, so this resolves once per boot
// against the active profile at that moment.
function additionsDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { activePath } = require('../profile-paths') as typeof import('../profile-paths');
  return path.join(activePath('batch-dir'), 'tracker-additions');
}
const SUMMARY_RE = /\+(\d+)\s+added.*?(\d+)\s+updated.*?(\d+)\s+skipped/i;

let watchHandle: fs.FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let mergeInFlight = false;
let pendingRescan = false;

function pendingTsvCount(): number {
  try {
    if (!fs.existsSync(additionsDir())) return 0;
    return fs.readdirSync(additionsDir()).filter((n) => n.endsWith('.tsv')).length;
  } catch {
    return 0;
  }
}

/**
 * Run merge-tracker once and emit the batch-merge event on success.
 * Idempotent — concurrent calls collapse via the mergeInFlight gate.
 */
function runMergeTracker(reason: string): Promise<JobResult> {
  return new Promise((resolve) => {
    if (mergeInFlight) {
      pendingRescan = true;
      resolve({ ok: false, error: 'merge already in flight' });
      return;
    }
    if (pendingTsvCount() === 0) {
      resolve({
        ok: true,
        message: 'No pending additions',
        meta: { added: 0, updated: 0, skipped: 0 },
      });
      return;
    }
    mergeInFlight = true;
    let stdout = '';
    let stderr = '';
    const p = spawn('node', ['scripts/tracker/merge-tracker.mjs'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err: Error) => {
      mergeInFlight = false;
      logEvent('batch-merge', 'merge-tracker failed to spawn', {
        level: 'error',
        category: 'system',
        message: err.message,
      });
      reportIssue({
        severity: 'error',
        source: 'auto-merge-batch',
        summary: 'Could not spawn merge-tracker.mjs',
        detail: err.message,
        dedupeKey: 'merge-spawn-failed',
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code: number | null) => {
      mergeInFlight = false;
      if (code !== 0) {
        logEvent('batch-merge', 'merge-tracker exited non-zero', {
          level: 'warn',
          category: 'system',
          message: 'exit ' + code + (stderr ? ' · ' + stderr.slice(0, 200) : ''),
        });
        reportIssue({
          severity: 'warn',
          source: 'auto-merge-batch',
          summary: 'merge-tracker.mjs exited non-zero',
          detail: 'exit ' + code + '\n\n' + stderr.slice(0, 500),
          dedupeKey: 'merge-nonzero',
        });
        // schedule a rescan so user-fixed TSVs can still merge later
        if (pendingRescan) {
          pendingRescan = false;
          setTimeout(() => runMergeTracker('rescan-after-failure'), 5000);
        }
        resolve({ ok: false, error: 'merge exited ' + code });
        return;
      }
      const m = stdout.match(SUMMARY_RE);
      const added = m ? parseInt(m[1], 10) : 0;
      const updated = m ? parseInt(m[2], 10) : 0;
      const skipped = m ? parseInt(m[3], 10) : 0;
      // Emit success event with source='batch-merge' so normalize.job + dedup.job
      // pick it up via the after-trigger listener.
      logEvent('batch-merge', 'Merged ' + added + ' new · ' + updated + ' updated', {
        level: 'success',
        category: 'application',
        message: 'reason=' + reason + ' · skipped ' + skipped,
      });
      // If more TSVs landed during the run, schedule another pass.
      if (pendingRescan && pendingTsvCount() > 0) {
        pendingRescan = false;
        setTimeout(() => runMergeTracker('rescan-after-success'), 1000);
      }
      resolve({ ok: true, message: 'Merged ' + added + ' new', meta: { added, updated, skipped } });
    });
  });
}

/** Debounced scheduler — multiple file events within 1.5s collapse into one merge. */
function scheduleMerge(reason: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runMergeTracker(reason).catch(() => {});
  }, 1500);
}

/** Start the fs watcher. Idempotent (safe to call multiple times). */
export function startBatchWatcher(): void {
  // Boot-time catch-up
  try {
    fs.mkdirSync(additionsDir(), { recursive: true });
  } catch {
    // mkdir recursive only fails on permission/IO — the watch attempt
    // below will surface the real error if the dir is unusable.
  }
  if (pendingTsvCount() > 0) {
    scheduleMerge('boot-catchup');
  }

  if (watchHandle) return;
  try {
    watchHandle = fs.watch(additionsDir(), { persistent: false }, (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.tsv')) return;
      // Only fire on rename/create — ignore content modifications
      if (event !== 'rename') return;
      // Debounce to consolidate batches of files
      scheduleMerge('fs-watch · ' + filename);
    });
    logEvent('boot', 'Batch tracker watcher started', {
      level: 'info',
      category: 'system',
      message: 'watching ' + additionsDir(),
    });
  } catch (err) {
    logEvent('boot', 'Batch tracker watcher failed to start', {
      level: 'error',
      category: 'system',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// D16 — `stopBatchWatcher` removed: HMR creates a fresh module instance
// so the previous fs.watch handle is GC'd. No caller imported it.

// Register a manual run option so power users can force a merge from the UI.
register({
  id: 'merge-batch',
  label: 'Merge batch additions',
  description:
    "Manually trigger merge-tracker.mjs against the active profile's batch/tracker-additions/ TSVs.",
  category: 'hygiene',
  trigger: { type: 'manual' },
  allowManual: true,
  perUser: true,
  run: () => runMergeTracker('manual'),
});
