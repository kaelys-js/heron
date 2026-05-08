/**
 * Pluggable job registry — a Map<id, JobDef> singleton populated at module
 * init time by individual `*.job.ts` modules.
 *
 * Designed to coexist with the legacy `runScan / runGemini / runLinkedInApply`
 * exports in `orchestrator.ts`. Those existing functions remain importable
 * for backward compatibility; we additionally register them here so that
 * Autopilot, /api/jobs/run, and after-event chains all see them.
 *
 * Bus listening for `after`-trigger jobs lives here so any job module can
 * declare `trigger: { type: 'after', tasks: ['scan'] }` and fire automatically
 * when a `Task finished` event for that source comes through the activity bus.
 */

import { installBusListener, logEvent, reportServerError } from '../events';
import type { ActivityEvent } from '$lib/types';
import type { JobArgs, JobDef, JobResult, JobSummary } from './types';

/** Internal map. Keyed by JobDef.id. */
const registry = new Map<string, JobDef>();

/** Track jobs we've kicked off via this registry (separate from
 *  orchestrator's child-process map; here we only track `running by id`
 *  to avoid stampedes when an after-event fires while one's already going). */
const inFlight = new Set<string>();

/**
 * Register a job. Last-writer-wins on collision so a `*.job.ts` reload
 * during dev cleanly replaces the previous definition.
 */
export function register(def: JobDef): void {
  registry.set(def.id, def);
}

export function unregister(id: string): void {
  registry.delete(id);
}

export function get(id: string): JobDef | undefined {
  return registry.get(id);
}

export function has(id: string): boolean {
  return registry.has(id);
}

/** All jobs, sorted by category then id for stable ordering. */
export function list(): JobDef[] {
  return [...registry.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
  });
}

/** Stripped-down summaries for /api/jobs (no `run` function leaked to client). */
export function listSummaries(): JobSummary[] {
  return list().map(({ id, label, description, category, trigger, allowManual }) => ({
    id, label, description, category, trigger, allowManual,
  }));
}

/**
 * Invoke a registered job by id. Catches throws so bad implementations
 * can't crash the server. The job itself is responsible for emitting
 * activity-feed events as it progresses.
 */
export async function runById(id: string, args?: JobArgs): Promise<JobResult> {
  const def = registry.get(id);
  if (!def) return { ok: false, error: 'Unknown job: ' + id };
  if (inFlight.has(id)) {
    return { ok: false, error: 'Job already in flight: ' + id };
  }
  inFlight.add(id);
  try {
    const result = await def.run(args);
    return result;
  } catch (err) {
    reportServerError('jobs', 'Job ' + id + ' threw', err, { category: 'system' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    inFlight.delete(id);
  }
}

/** True while an in-flight invocation is running for this id. */
export function isRunning(id: string): boolean {
  return inFlight.has(id);
}

/**
 * Install a single bus listener that fires `after`-triggered jobs when any
 * upstream task emits a success-level event. Idempotent — calling twice is
 * a no-op.
 *
 * The listener fires on ANY level=success event whose source matches one of
 * a job's `trigger.tasks` list. This intentionally accepts both:
 *   - Spawned-process completion events (category='task', e.g. scan finished)
 *   - Synthetic events from API endpoints (e.g. category='application' with
 *     source='status-update'), which is how /api/status fires the normalize
 *     hygiene job.
 *
 * To prevent infinite chains, the listener skips its own emitted "after-
 * trigger" notification events (source=jobId, title starts with 'After-trigger').
 */
export function installAfterListener(): void {
  // installBusListener is idempotent across HMR — re-call replaces the
  // previous listener instead of stacking. See events.ts for rationale.
  installBusListener('jobs/registry/after', (ev: ActivityEvent) => {
    if (ev.level !== 'success') return;
    if (ev.title.startsWith('After-trigger from ')) return;
    const finishedId = ev.source;
    // Find every registered job whose trigger.tasks list includes this id
    for (const def of registry.values()) {
      if (def.trigger.type !== 'after') continue;
      if (!def.trigger.tasks.includes(finishedId)) continue;
      // Don't chain a job to its own success event
      if (def.id === finishedId) continue;
      // Fire and forget — log if it errors
      logEvent(def.id, 'After-trigger from ' + finishedId, {
        category: 'system',
        message: def.label,
      });
      runById(def.id).catch((err) => {
        reportServerError('jobs', 'After-trigger ' + def.id + ' failed', err, {
          category: 'system',
        });
      });
    }
  });
}
