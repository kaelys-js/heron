/**
 * apply-state — per-job persistent state for the autonomous apply pipeline.
 *
 * Each in-flight apply writes progress to `data/apply-state/{jobId}.json`.
 * The state file lets the dashboard:
 *  - Show "Applying · {lastStep}" on /queue while a script is running
 *  - Display the screenshot when a CAPTCHA / failure mode is hit
 *  - Future-proof for resume-from-step-N retry (not implemented yet)
 *
 * Shared across profiles — jobId is globally unique (URL-derived).
 *
 * Lifecycle:
 *   queue-apply endpoint  →  writeApplyState({lastStep: 'queued'})
 *   apply-queue drain     →  writeApplyState({lastStep: 'dispatched'})
 *   Python script         →  writes progress lines APPLY_STEP:<name> which the
 *                            dispatcher parses into appendStep() calls
 *   On success            →  clearApplyState(jobId)
 *   On manual-apply-need  →  state stays; Inbox Issue references it
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const DIR = path.join(ROOT, 'data', 'apply-state');

export type ApplyState = {
  jobId: string;
  url: string;
  portal: string; // 'linkedin' | 'greenhouse' | 'ashby' | 'lever' | ... | 'unknown'
  profileId: string;
  startedAt: number; // unix ms
  lastStep: string; // most recent step name (e.g. 'filled_resume')
  stepHistory: string[]; // every step in order
  /** Screenshot path (relative to ROOT) saved when a failure mode is hit.
   *  Used by the Inbox Issue CTA to show what the script was looking at. */
  screenshotPath?: string;
  /** Wall-clock when the last step was appended. Lets the UI detect stuck
   *  jobs (e.g. step hasn't advanced in 5 min → likely orphaned). */
  capturedAt?: number;
};

function statePath(jobId: string): string {
  // Sanitize — jobId comes from urlId() in parsers.ts so it's already
  // [a-f0-9]+, but guard against future suffixed forms (':profileId').
  const safe = jobId.replace(/[^a-zA-Z0-9_\-:]/g, '');
  return path.join(DIR, safe + '.json');
}

function ensureDir(): void {
  fs.mkdirSync(DIR, { recursive: true });
}

export function readApplyState(jobId: string): ApplyState | null {
  const p = statePath(jobId);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as ApplyState;
  } catch {
    return null;
  }
}

export function writeApplyState(state: ApplyState): void {
  ensureDir();
  fs.writeFileSync(
    statePath(state.jobId),
    JSON.stringify({ ...state, capturedAt: Date.now() }, null, 2) + '\n',
  );
}

/** Append a step to the history of an existing state file. No-op when no
 *  state exists — caller should `writeApplyState` first to seed. */
export function appendStep(jobId: string, step: string): void {
  const prev = readApplyState(jobId);
  if (!prev) return;
  writeApplyState({
    ...prev,
    lastStep: step,
    stepHistory: [...prev.stepHistory, step],
  });
}

export function clearApplyState(jobId: string): void {
  const p = statePath(jobId);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/** Return every in-flight apply (one per `data/apply-state/*.json`).
 *  Used by /queue to render Applying jobs with their current step name. */
export function listInFlight(): ApplyState[] {
  ensureDir();
  const out: ApplyState[] = [];
  try {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        if (parsed && typeof parsed === 'object') out.push(parsed as ApplyState);
      } catch {
        /* skip unreadable */
      }
    }
  } catch {
    /* dir missing */
  }
  return out;
}

/** Path getter for reset / cleanup code that needs to back up the dir. */
export function applyStateDir(): string {
  return DIR;
}
