/**
 * Type definitions for the pluggable job registry.
 *
 * Every long-running task (scan, gemini, apply, hygiene sweeps, after-event
 * chains) is represented as a `JobDef` registered via `registry.register()`.
 * Autopilot, the manual run endpoints, and the after-event listeners all
 * consume from this single source of truth.
 *
 * Pure-types module (zero runtime imports). Safe to import from anywhere.
 */

/** Categories drive the UI grouping on Autopilot / Agents pages. */
export type JobCategory =
  | 'discovery' // scans + portal pulls
  | 'evaluation' // gemini / evaluate / batch
  | 'apply' // linkedin apply, bulk apply
  | 'hygiene' // normalize, dedup, verify, liveness, auto-triage
  | 'insight' // pattern analysis, follow-up cadence, daily digest
  | 'system'; // boot, scheduler, circuit-breaker

/** When a job runs autonomously. Manual-only jobs use `manual`. */
export type ScheduleTrigger =
  | { type: 'manual' }
  | {
      type: 'daily';
      hour: number;
      minute: number;
      /** 0=Sunday, 6=Saturday. Empty array = every day. */
      weekdays?: number[];
    }
  | {
      type: 'weekly';
      /** 0=Sunday, 6=Saturday. */
      dayOfWeek: number;
      hour: number;
      minute: number;
    }
  | {
      type: 'after';
      /** Job IDs that, when they finish successfully, fire this job. */
      tasks: string[];
    };

/** Outcome envelope returned by `run()`. */
export type JobResult =
  | { ok: true; message?: string; meta?: Record<string, unknown> }
  | { ok: false; error: string; meta?: Record<string, unknown> };

/** Optional args passed at run time (CLI flags, scopes, etc.). */
export type JobArgs = Record<string, unknown>;

export type JobDef = {
  /** Stable id used in URLs, autopilot config, after-event triggers. */
  id: string;
  /** Display name shown in UI lists. */
  label: string;
  /** One-sentence description. */
  description: string;
  category: JobCategory;
  trigger: ScheduleTrigger;
  /** False = won't show on the Agents page or in /api/jobs/[id]/run. Useful
   *  for jobs that are strictly after-event triggered or fired internally. */
  allowManual: boolean;
  /** True = `runById` fans out across every schedulable user, wrapping each
   *  invocation in `runAsUser(userId, …)`. The job's `run()` sees one user
   *  per call via `currentUserId()`. False = job runs once with whatever
   *  context the caller provides (system jobs only — boot, cleanup, etc.).
   *
   *  Multi-user safety: every job that touches user data MUST set this to
   *  true. The vitest test `jobs-per-user.integration.test.ts` enforces
   *  this against the static set of system-only jobs. */
  perUser: boolean;
  /** The implementation. May spawn a subprocess, call `logEvent`, etc.
   *  Must not throw — return `{ ok: false, error }` for failures. */
  run: (args?: JobArgs) => Promise<JobResult> | JobResult;
};

/** Public-facing summary the registry serializes to JSON for `/api/jobs`. */
export type JobSummary = Pick<
  JobDef,
  'id' | 'label' | 'description' | 'category' | 'trigger' | 'allowManual'
>;
