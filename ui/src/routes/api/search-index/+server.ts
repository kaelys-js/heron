/**
 * Lightweight index of every job for client-side search palette.
 * Returns id, company, role, location, status, score, bgRisk — under 100 bytes per job.
 */

import { wrap } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';

export const GET = wrap('search-index', async () => {
  const jobs = loadAllJobs().map((j) => ({
    id: j.id,
    company: j.company,
    role: j.role,
    location: j.location,
    status: j.status,
    score: j.score ?? j.geminiScore ?? null,
    bgRisk: j.bgRisk ?? null,
  }));
  return { jobs };
});
