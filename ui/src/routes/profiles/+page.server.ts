/**
 * /profiles — management page server loader.
 *
 * Returns every profile + light stats per profile (job count, applied count).
 * Stats are derived from each profile's own loadAllJobs() result.
 */
import { readProfiles } from '$lib/server/profiles';
import { loadAllJobs } from '$lib/server/parsers';

export async function load() {
  const state = readProfiles();
  const stats: Record<string, { totalJobs: number; applied: number; reports: number }> = {};
  for (const p of state.profiles) {
    const jobs = loadAllJobs(p.id);
    const applied = jobs.filter((j) => {
      const s = j.status;
      return (
        s === 'Applied' ||
        s === 'Screened' ||
        s === 'Interview' ||
        s === 'Offer' ||
        s === 'Rejected'
      );
    }).length;
    const reports = jobs.filter((j) => !!j.reportFile).length;
    stats[p.id] = { totalJobs: jobs.length, applied, reports };
  }
  return { state, stats };
}
