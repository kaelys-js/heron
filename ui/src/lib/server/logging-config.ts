/** logging-config -- env-driven verbosity gates for the activity logger.
 *
 *  shouldPersist() decides whether a given event is written to the DURABLE sinks
 *  (activity.jsonl + SQLite + stdout). The in-memory bus + the live SSE feed are
 *  ALWAYS emitted regardless -- the in-app activity feed must stay real-time even
 *  when prod disk-logging is quieted. So this gate only trims on-disk / console
 *  noise; it never hides an event from a connected dashboard.
 *
 *  Controls (default = log everything at info+):
 *    HERON_LOG_LEVEL = error | warn | info  (default 'info'). Events below the
 *      threshold are bus-only. 'success' ranks with 'info'.
 *    HERON_LOG_MUTE  = comma list of `source` names to drop from the durable
 *      sinks (e.g. 'web-vitals,csp') -- noisy diagnostics you still want live but
 *      not on disk. */
import type { EventLevel } from '$lib/types';

const RANK: Record<EventLevel, number> = { success: 1, info: 1, warn: 2, error: 3 };

/** Lowest severity that still persists, from HERON_LOG_LEVEL (default info=1). */
function minRank(env: NodeJS.ProcessEnv): number {
  const lvl = (env.HERON_LOG_LEVEL ?? '').toLowerCase() as EventLevel;
  return RANK[lvl] ?? RANK.info;
}

/** True iff this event should reach the durable sinks (disk + SQLite + console).
 *  `env` is injectable for testing. */
export function shouldPersist(
  level: EventLevel,
  source: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if ((RANK[level] ?? RANK.info) < minRank(env)) {
    return false;
  }
  const muted = (env.HERON_LOG_MUTE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (muted.includes(source)) {
    return false;
  }
  return true;
}
