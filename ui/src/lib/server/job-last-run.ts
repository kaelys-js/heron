/**
 * job-last-run — per-job last-run state for jobs registered via the
 * job registry (lib/server/jobs/*.job.ts). Stored separately from the
 * autopilot config so registry-declared schedules don't have to be
 * duplicated into `data/autopilot.json` just to track lastRunAt.
 *
 * Storage: `data/job-last-run.json`. Shared across profiles — the
 * registry id is the key (no profile suffix).
 *
 * Used by `autopilot.ts:tick()` (Phase 2) to dedupe today-firing of
 * registry-declared schedules, and by `autopilot.ts:trackResult()` to
 * flip lastRunResult success/failure after the job exits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const PATH = path.join(ROOT, 'data', 'job-last-run.json');

export type JobLastRunResult = 'success' | 'failure' | 'started';

export type JobLastRun = {
  lastRunAt: number;
  lastRunResult: JobLastRunResult;
  lastRunMessage?: string;
};

type AllRuns = Record<string, JobLastRun>;

function readAll(): AllRuns {
  try {
    if (!fs.existsSync(PATH)) return {};
    const raw = fs.readFileSync(PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as AllRuns) : {};
  } catch {
    return {};
  }
}

function writeAll(all: AllRuns): void {
  fs.mkdirSync(path.dirname(PATH), { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify(all, null, 2) + '\n');
}

/** Returns null when the job has never run (or after `clearLastRun`). */
export function readLastRun(jobId: string): JobLastRun | null {
  const all = readAll();
  return all[jobId] ?? null;
}

/** Upsert by jobId. Caller is responsible for atomic state transitions. */
export function writeLastRun(jobId: string, state: JobLastRun): void {
  const all = readAll();
  all[jobId] = state;
  writeAll(all);
}

/** Remove a job's state entirely (e.g. on reset 'everything'). */
export function clearLastRun(jobId: string): void {
  const all = readAll();
  delete all[jobId];
  writeAll(all);
}

/** Wipe every entry — used by reset 'everything' (Phase 4). */
export function clearAllLastRuns(): void {
  if (fs.existsSync(PATH)) {
    // Back up before wiping so reset is recoverable.
    try {
      fs.copyFileSync(PATH, PATH + '.bak');
    } catch {}
    fs.unlinkSync(PATH);
  }
}

/** Path getter for reset code that needs to back up the file. */
export function jobLastRunPath(): string {
  return PATH;
}
