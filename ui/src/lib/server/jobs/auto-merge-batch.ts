/**
 * Auto-merge batch additions -- fs watcher.
 *
 * The batch runner (`scripts/batch/batch-runner.sh`) writes one TSV per
 * evaluated job into the active profile's `batch/tracker-additions/`.
 * Today the user must run `node merge-tracker.mjs` by hand. This watcher
 * does it automatically, debouncing so multiple TSVs landing in quick
 * succession trigger only one merge-tracker invocation.
 *
 * After a successful merge:
 *   - merge-tracker itself moves consumed TSVs to `tracker-additions/merged/`
 *     so we don't reprocess them
 *   - We emit a synthetic 'batch-merge' success event so normalize + dedup
 *     hygiene jobs chain via the after-trigger listener
 *   - Issue stream gets a row if anything looked malformed
 *
 * Boot path: also runs once at startup so any TSVs that landed while the
 * dev server was down get caught up -- for every user × profile, not just
 * the active one.
 *
 * Multi-user (F16): pre-fix the watcher resolved a single
 * `additionsDir()` from SYSTEM_USER's ALS context at boot and used
 * `fs.watch` against that one directory. TSVs landing under
 * `data/users/{uid}/profiles/{slug}/batch/tracker-additions/` (where the
 * per-user batch runner writes them -- see `orchestrator.ts:701`) were
 * never seen, so the auto-merge → dedup → normalize chain never fired
 * for real users. Now: chokidar globs across every user × profile and
 * each event fires `runMergeTracker` inside `runAsUser(userId, …)` so
 * the merge writes back into the correct user's applications.md.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { reportIssue } from '../issues';
import { register } from './registry';
import type { JobResult } from './types';
import { runAsUser, SYSTEM_USER_ID, userContextEnv } from '../user-context';

const SUMMARY_RE = /\+(\d+)\s+added.*?(\d+)\s+updated.*?(\d+)\s+skipped/i;

let watcher: FSWatcher | null = null;

/** Per-(user × reason)-keyed debounce so concurrent users' merges don't
 *  collapse together. Pre-F16 there was one global debounceTimer which
 *  meant user A's TSV landing right after user B's would skip user B's
 *  merge entirely. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Per-user in-flight gate. */
const mergeInFlight = new Set<string>();
/** Per-user "another TSV landed mid-merge -- schedule a rescan" flag. */
const pendingRescan = new Set<string>();

/**
 * Pull the userId out of a tracker-additions TSV path. Returns
 * SYSTEM_USER_ID for legacy `data/profiles/{slug}/...` paths.
 * Returns null for paths that don't match the expected layouts.
 */
function userIdFromTsvPath(abs: string): string | null {
  const rel = path.relative(ROOT, abs).replaceAll('\\', '/');
  // data/users/{uid}/profiles/{slug}/batch/tracker-additions/*.tsv
  const multi = rel.match(
    /^data\/users\/([^/]+)\/profiles\/[^/]+\/batch\/tracker-additions\/.+\.tsv$/,
  );
  if (multi) return multi[1];
  // data/profiles/{slug}/batch/tracker-additions/*.tsv  (legacy single-user)
  const legacy = rel.match(/^data\/profiles\/[^/]+\/batch\/tracker-additions\/.+\.tsv$/);
  if (legacy) return SYSTEM_USER_ID;
  return null;
}

function additionsDirForUser(userId: string): string {
  // Resolve via profile-paths so the active-profile resolution stays in
  // one place. Requires runAsUser context.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { activePath } = require('../profile-paths') as typeof import('../profile-paths');
  return path.join(activePath('batch-dir'), 'tracker-additions');
}

function pendingTsvCountForUser(userId: string): number {
  let count = 0;
  try {
    // Synchronous traversal -- small directory, runs at boot only.
    const usersRoot =
      userId === SYSTEM_USER_ID
        ? path.join(ROOT, 'data', 'profiles')
        : path.join(ROOT, 'data', 'users', userId, 'profiles');
    if (!fs.existsSync(usersRoot)) return 0;
    for (const slug of fs.readdirSync(usersRoot)) {
      const dir = path.join(usersRoot, slug, 'batch', 'tracker-additions');
      if (!fs.existsSync(dir)) continue;
      count += fs.readdirSync(dir).filter((n) => n.endsWith('.tsv')).length;
    }
  } catch {
    /* swallow -- best effort */
  }
  return count;
}

/**
 * Run merge-tracker once FOR A SPECIFIC USER and emit the batch-merge
 * event on success. Idempotent -- concurrent calls collapse via the
 * per-user mergeInFlight gate.
 */
function runMergeTrackerForUser(userId: string, reason: string): Promise<JobResult> {
  return new Promise((resolve) => {
    if (mergeInFlight.has(userId)) {
      pendingRescan.add(userId);
      resolve({ ok: false, error: 'merge already in flight for ' + userId });
      return;
    }
    if (pendingTsvCountForUser(userId) === 0) {
      resolve({
        ok: true,
        message: 'No pending additions',
        meta: { added: 0, updated: 0, skipped: 0 },
      });
      return;
    }
    mergeInFlight.add(userId);
    void runAsUser(userId, async () => {
      let stdout = '';
      let stderr = '';
      const p = spawn('node', ['scripts/tracker/merge-tracker.mjs'], {
        cwd: ROOT,
        // userContextEnv picks up the userId from the ALS context we're
        // already inside -- no need to override explicitly.
        env: userContextEnv(),
      });
      p.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString();
      });
      p.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      p.on('error', (err: Error) => {
        mergeInFlight.delete(userId);
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
        mergeInFlight.delete(userId);
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
          if (pendingRescan.has(userId)) {
            pendingRescan.delete(userId);
            setTimeout(() => runMergeTrackerForUser(userId, 'rescan-after-failure'), 5000);
          }
          resolve({ ok: false, error: 'merge exited ' + code });
          return;
        }
        const m = stdout.match(SUMMARY_RE);
        const added = m ? parseInt(m[1], 10) : 0;
        const updated = m ? parseInt(m[2], 10) : 0;
        const skipped = m ? parseInt(m[3], 10) : 0;
        // Emit success event with source='batch-merge' so normalize.job +
        // dedup.job pick it up via the after-trigger listener.
        logEvent('batch-merge', 'Merged ' + added + ' new · ' + updated + ' updated', {
          level: 'success',
          category: 'application',
          message: 'reason=' + reason + ' · skipped ' + skipped,
        });
        if (pendingRescan.has(userId) && pendingTsvCountForUser(userId) > 0) {
          pendingRescan.delete(userId);
          setTimeout(() => runMergeTrackerForUser(userId, 'rescan-after-success'), 1000);
        }
        resolve({
          ok: true,
          message: 'Merged ' + added + ' new',
          meta: { added, updated, skipped },
        });
      });
    });
  });
}

/** Manual-trigger wrapper: when invoked from /api/jobs/merge-batch/run (which
 *  always hits inside a user ALS context via hooks.server.ts), this resolves
 *  the current user and runs the per-user merger. */
function runMergeTracker(reason: string): Promise<JobResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { maybeCurrentUserId } = require('../user-context') as typeof import('../user-context');
  const uid = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  return runMergeTrackerForUser(uid, reason);
}

/** Debounced scheduler -- multiple file events for THE SAME USER within
 *  1.5s collapse into one merge. */
function scheduleMergeForUser(userId: string, reason: string): void {
  const existing = debounceTimers.get(userId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    userId,
    setTimeout(() => {
      debounceTimers.delete(userId);
      runMergeTrackerForUser(userId, reason).catch(() => {});
    }, 1500),
  );
}

/** Start the chokidar watcher across every user × profile. Idempotent
 *  (safe to call multiple times). */
export function startBatchWatcher(): void {
  if (watcher) return;
  // Boot-time catch-up: scan every user's tracker-additions tree for
  // TSVs that landed while the dev server was down.
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { listSchedulableUsers } =
        require('../user-context') as typeof import('../user-context');
      const userIds = await listSchedulableUsers();
      for (const userId of userIds) {
        if (pendingTsvCountForUser(userId) > 0) {
          scheduleMergeForUser(userId, 'boot-catchup');
        }
      }
      // Always check the legacy SYSTEM tree too (single-user installs
      // that haven't been migrated yet).
      if (!userIds.includes(SYSTEM_USER_ID) && pendingTsvCountForUser(SYSTEM_USER_ID) > 0) {
        scheduleMergeForUser(SYSTEM_USER_ID, 'boot-catchup-legacy');
      }
    } catch (err) {
      logEvent('boot', 'Batch tracker boot-catchup failed', {
        level: 'warn',
        category: 'system',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  // chokidar glob -- `data/users/*/profiles/*/batch/tracker-additions/*.tsv`
  // covers every multi-user install, and the second pattern covers the
  // legacy single-user layout. ignoreInitial: true because the boot
  // catch-up loop above already handles pre-existing files.
  try {
    watcher = chokidar.watch(
      [
        path.join(ROOT, 'data/users/*/profiles/*/batch/tracker-additions/*.tsv'),
        path.join(ROOT, 'data/profiles/*/batch/tracker-additions/*.tsv'),
      ],
      {
        ignoreInitial: true,
        // depth+1 so we don't traverse into per-profile output/, reports/, etc.
        depth: 7,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      },
    );
    watcher.on('add', (filepath: string) => {
      if (!filepath.endsWith('.tsv')) return;
      const userId = userIdFromTsvPath(filepath);
      if (!userId) return; // unexpected layout -- skip
      scheduleMergeForUser(userId, 'fs-watch · ' + path.basename(filepath));
    });
    watcher.on('error', (err: unknown) => {
      logEvent('boot', 'Batch tracker watcher emitted error', {
        level: 'warn',
        category: 'system',
        message: err instanceof Error ? err.message : String(err),
      });
    });
    logEvent('boot', 'Batch tracker watcher started', {
      level: 'info',
      category: 'system',
      message: 'chokidar globbing per-user tracker-additions',
    });
  } catch (err) {
    logEvent('boot', 'Batch tracker watcher failed to start', {
      level: 'error',
      category: 'system',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// `additionsDirForUser` is exported in case future maintenance code wants
// to inspect per-user dirs without re-implementing the path math.
export { additionsDirForUser };

// D16 -- `stopBatchWatcher` removed: HMR creates a fresh module instance
// so the previous watcher is GC'd. No caller imported it.

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
