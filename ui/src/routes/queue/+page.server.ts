/**
 * /queue loader — surfaces every job currently in the autonomous-apply
 * pipeline so the user can supervise the drain:
 *
 *   Queued            — staged, waiting for apply-queue-drain to run
 *   Applying          — script running right now, with current step
 *   ManualApplyNeeded — soft-failed, finish by hand from Inbox
 *
 * Profile-scoped: `?profile=<slug>` filters to that profile. `?profile=all`
 * shows the union across every profile. No query param → active profile.
 *
 * Side-data the page renders in its header:
 *   todayCount    — applications sent today (for the X/cap counter)
 *   cap           — maxAppliesPerDay from autopilot config
 *   inFlight      — Map(jobId → ApplyState) so Applying rows show step
 */

import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId } from '$lib/server/profiles';
import { listInFlight, type ApplyState } from '$lib/server/apply-state';
import { todayCount } from '$lib/server/apply-counter';
import { readConfig } from '$lib/server/autopilot';

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());

  const all = loadAllJobs(profileId);
  const queued = all.filter((j) => j.status === 'Queued');
  const applying = all.filter((j) => j.status === 'Applying');
  const manual = all.filter((j) => j.status === 'ManualApplyNeeded');

  // Highest-fit first — drain processes in this order, so the UI should
  // mirror it.
  const byScore = (a: (typeof all)[number], b: (typeof all)[number]) =>
    (b.score ?? b.geminiScore ?? 0) - (a.score ?? a.geminiScore ?? 0);
  queued.sort(byScore);
  applying.sort(byScore);
  manual.sort(byScore);

  // Index the in-flight state map by job id so the Applying-row template
  // can show "Step: filled_email · cv uploaded" without a per-row fetch.
  const inFlight: Record<string, ApplyState> = {};
  try {
    for (const s of listInFlight()) inFlight[s.jobId] = s;
  } catch {
    /* swallow — page still renders fine without per-step detail */
  }

  return {
    queued,
    applying,
    manual,
    profileId,
    todayCount: todayCount(),
    cap: readConfig().thresholds.maxAppliesPerDay,
    inFlight,
  };
}
