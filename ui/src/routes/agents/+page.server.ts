/**
 * Agents page loader — pulls every registered job's summary from the
 * pluggable job registry. Previously the page hardcoded a list of 4
 * cards; this loader makes /agents the single user-facing surface for
 * manually triggering any of the 18+ registered jobs.
 *
 * Filters out jobs with `allowManual: false` since those are after-
 * event chains or internal-only.
 */
import { listSummaries } from '$lib/server/jobs';

export async function load() {
  const summaries = listSummaries().filter((s) => s.allowManual);
  return { agents: summaries };
}
