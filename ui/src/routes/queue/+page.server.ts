/**
 * /queue loader — surfaces every job in status=Queued so the user can review
 * + batch-send. Auto-queued by `auto-queue.ts` whenever a CV finishes.
 */

import { loadAllJobs } from '$lib/server/parsers';

export async function load() {
  const queued = loadAllJobs().filter((j) => j.status === 'Queued');
  // Sort by score descending so the strongest fits batch-send first.
  queued.sort((a, b) => (b.score ?? b.geminiScore ?? 0) - (a.score ?? a.geminiScore ?? 0));
  return { queued };
}
