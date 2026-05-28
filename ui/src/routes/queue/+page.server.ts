/** /queue loader -- jobs in the autonomous-apply pipeline.
 *  Statuses: Queued (waiting for drain), Applying (script running, with
 *  current step), ManualApplyNeeded (soft-failed, finish in Inbox).
 *  ?profile=<slug> filters; ?profile=all unions; default = active.
 *  Header data: todayCount, cap (maxAppliesPerDay), inFlight (Map(jobId
 *  → ApplyState) so Applying rows show their current step). */

import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId } from '$lib/server/profiles';
import { listInFlight } from '$lib/server/apply-state';
import type { ApplyState } from '$lib/server/apply-state';
import { todayCount } from '$lib/server/apply-counter';
import { readConfig } from '$lib/server/autopilot';

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());

  const all = loadAllJobs(profileId);
  const queued = all.filter((j) => j.status === 'Queued');
  const applying = all.filter((j) => j.status === 'Applying');
  const manual = all.filter((j) => j.status === 'ManualApplyNeeded');

  // Highest-fit first -- drain processes in this order, so the UI should
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
    for (const s of listInFlight()) {
      inFlight[s.jobId] = s;
    }
  } catch {
    /* swallow -- page still renders fine without per-step detail */
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
