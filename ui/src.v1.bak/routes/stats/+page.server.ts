import { loadAllJobs, groupByStatus } from '$lib/server/parsers';
import { listReports, listPdfs, OUTPUT_DIR, GEMINI_SCORES } from '$lib/server/files';
import fs from 'node:fs';

export async function load() {
  const jobs = loadAllJobs();
  const grouped = groupByStatus(jobs);

  const counts = {
    total: jobs.length,
    new: grouped.New.length,
    scored: grouped.Scored.length,
    ready: grouped.Ready.length,
    applied: grouped.Applied.length,
    screened: grouped.Screened.length,
    interview: grouped.Interview.length,
    offer: grouped.Offer.length,
    rejected: grouped.Rejected.length,
    closed: grouped.Closed.length,
  };

  const reports = listReports().length;
  const pdfs = listPdfs().length;

  // Score distribution
  const dist = { high: 0, mid: 0, low: 0, unscored: 0 };
  for (const j of jobs) {
    const s = j.score ?? j.geminiScore;
    if (s == null) dist.unscored++;
    else if (s >= 4) dist.high++;
    else if (s >= 3) dist.mid++;
    else dist.low++;
  }

  // Callback rate (ratio of post-applied to applied)
  const post = counts.screened + counts.interview + counts.offer;
  const applied = counts.applied + post + counts.rejected;
  const callbackRate = applied > 0 ? (post + counts.rejected > 0 ? Math.round((post / applied) * 100) : 0) : 0;

  return { counts, reports, pdfs, dist, callbackRate, applied };
}
