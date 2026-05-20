/** Per-job state for the autonomous-apply pipeline, written to
 *  `data/apply-state/{jobId}.json`. Drives /queue's "Applying · {step}"
 *  UI, surfaces screenshots on CAPTCHA / failure, and persists the step
 *  trail for audit. Retries re-run from step 0 (idempotent on every
 *  adapter); the persisted trail is the future resume-from-N hook.
 *  Shared across profiles (jobId is URL-derived, globally unique). */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_ROOT } from './files';
import { logEvent, reportServerError } from './events';

const DIR = path.join(DATA_ROOT, 'apply-state');

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
  // Sanitize -- jobId comes from urlId() in parsers.ts so it's already
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
  } catch (e) {
    // Corrupt state file -- likely a half-written JSON from a crash
    // mid-write. Surface so the dispatcher's "where am I?" lookups don't
    // silently treat in-flight applies as never-started.
    logEvent('apply-state', 'State file unreadable · ' + jobId, {
      level: 'warn',
      category: 'application',
      message: p + ': ' + (e instanceof Error ? e.message : String(e)),
    });
    return null;
  }
}

export function writeApplyState(state: ApplyState): void {
  ensureDir();
  try {
    fs.writeFileSync(
      statePath(state.jobId),
      JSON.stringify({ ...state, capturedAt: Date.now() }, null, 2) + '\n',
    );
    logEvent('apply-state', 'Apply step · ' + state.lastStep, {
      level: 'info',
      category: 'application',
      message:
        state.portal + ' · ' + state.jobId + (state.url ? ' · ' + state.url.slice(0, 80) : ''),
      profileId: state.profileId,
    });
  } catch (e) {
    // Persistence failure is critical -- the dispatcher won't be able to
    // resume / report state. Re-throw after logging so callers see it.
    reportServerError('apply-state', 'Write failed · ' + state.jobId, e, {
      category: 'application',
      profileId: state.profileId,
    });
    throw e;
  }
}

/** Append a step to the history of an existing state file. No-op when no
 *  state exists -- caller should `writeApplyState` first to seed. */
export function appendStep(jobId: string, step: string): void {
  const prev = readApplyState(jobId);
  if (!prev) {
    // Seeded-step race: APPLY_STEP arrived from the worker before the
    // dispatcher seeded the state file. Worth surfacing -- usually means
    // the seeding writeApplyState() call errored silently.
    logEvent('apply-state', 'appendStep skipped — no state for ' + jobId, {
      level: 'warn',
      category: 'application',
      message: 'step=' + step + ' (state file missing or unreadable)',
    });
    return;
  }
  writeApplyState({
    ...prev,
    lastStep: step,
    stepHistory: [...prev.stepHistory, step],
  });
}

export function clearApplyState(jobId: string): void {
  const p = statePath(jobId);
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      logEvent('apply-state', 'Cleared · ' + jobId, {
        level: 'info',
        category: 'application',
      });
    }
  } catch (e) {
    // State file unlink failed -- surface, but don't throw; subsequent
    // applies for the same jobId will just overwrite.
    logEvent('apply-state', 'Clear failed · ' + jobId, {
      level: 'warn',
      category: 'application',
      message: p + ': ' + (e instanceof Error ? e.message : String(e)),
    });
  }
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
      } catch (e) {
        // Corrupt individual state file -- keep going so one bad file
        // doesn't blank out the entire /queue UI. Surface for visibility.
        logEvent('apply-state', 'Skipped corrupt state file · ' + f, {
          level: 'warn',
          category: 'application',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } catch (e) {
    // The dir is created by ensureDir() at the top -- any error here is
    // EACCES / EIO and worth surfacing.
    reportServerError('apply-state', 'listInFlight readdir failed', e, {
      category: 'application',
    });
  }
  return out;
}

/** Path getter for reset / cleanup code that needs to back up the dir. */
export function applyStateDir(): string {
  return DIR;
}
