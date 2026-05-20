/** Per-job last-run state for jobs registered via the job registry
 *  (lib/server/jobs/*.job.ts). Stored separately from autopilot config
 *  so registry-declared schedules don't have to be duplicated into
 *  `autopilot.json` just to track lastRunAt. Storage: per-user at
 *  `data/users/{userId}/profiles/_shared/job-last-run.json` (legacy
 *  `data/profiles/_shared/job-last-run.json` under SYSTEM_USER_ID).
 *  F10 -- must be per-user; a single global file would let user A's
 *  9:00am scan suppress user B's 9:01am tick. Used by autopilot.ts
 *  tick() to dedupe today-firing and trackResult() to flip the
 *  success/failure flag after the job exits. */

import fs from 'node:fs';
import path from 'node:path';
import { userSharedPath, userSharedPathForUser } from './profile-paths';
import { currentUserIdOrDefault } from './user-context';

export type JobLastRunResult = 'success' | 'failure' | 'started';

export type JobLastRun = {
  lastRunAt: number;
  lastRunResult: JobLastRunResult;
  lastRunMessage?: string;
};

type AllRuns = Record<string, JobLastRun>;

function readAll(p: string): AllRuns {
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as AllRuns) : {};
  } catch {
    return {};
  }
}

function writeAll(p: string, all: AllRuns): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all, null, 2) + '\n');
}

/** Returns null when the job has never run (or after `clearLastRun`).
 *  Resolves to the current user via ALS -- callers outside a user context
 *  should use `readLastRunForUser(userId, jobId)` instead. */
export function readLastRun(jobId: string): JobLastRun | null {
  return readLastRunForUser(currentUserIdOrDefault(), jobId);
}

export function readLastRunForUser(userId: string, jobId: string): JobLastRun | null {
  const all = readAll(userSharedPathForUser(userId, 'job-last-run'));
  return all[jobId] ?? null;
}

/** Upsert by jobId. Caller is responsible for atomic state transitions. */
export function writeLastRun(jobId: string, state: JobLastRun): void {
  writeLastRunForUser(currentUserIdOrDefault(), jobId, state);
}

export function writeLastRunForUser(userId: string, jobId: string, state: JobLastRun): void {
  const p = userSharedPathForUser(userId, 'job-last-run');
  const all = readAll(p);
  all[jobId] = state;
  writeAll(p, all);
}

/** Remove a job's state entirely (e.g. on reset 'everything'). */
export function clearLastRun(jobId: string): void {
  clearLastRunForUser(currentUserIdOrDefault(), jobId);
}

export function clearLastRunForUser(userId: string, jobId: string): void {
  const p = userSharedPathForUser(userId, 'job-last-run');
  const all = readAll(p);
  delete all[jobId];
  writeAll(p, all);
}

/** Wipe every entry for the current user -- used by the
 *  reset-everything danger-zone action. */
export function clearAllLastRuns(): void {
  clearAllLastRunsForUser(currentUserIdOrDefault());
}

export function clearAllLastRunsForUser(userId: string): void {
  const p = userSharedPathForUser(userId, 'job-last-run');
  if (!fs.existsSync(p)) return;
  // Back up before wiping so reset is recoverable. Best-effort -- if the
  // .bak copy fails we still proceed with the unlink rather than block
  // the reset flow on a permissions issue.
  try {
    fs.copyFileSync(p, p + '.bak');
  } catch {
    // .bak copy failed -- reset proceeds without recoverable backup.
  }
  fs.unlinkSync(p);
}

/** Path getter for reset code that needs to back up the file. Resolves
 *  to the current user's path. */
export function jobLastRunPath(): string {
  return userSharedPath('job-last-run');
}
