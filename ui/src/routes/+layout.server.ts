import { loadAllJobs } from '$lib/server/parsers';

export async function load() {
  const jobs = loadAllJobs();
  const ready = jobs.filter((j) => j.status === 'Ready');
  const inboxCount = jobs.filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && (j.status === 'Scored' || j.status === 'New')).length;
  const queueCount = jobs.filter((j) => j.status === 'Queued').length;
  return {
    inboxCount,
    queueCount,
    pinnedJobs: ready.slice(0, 8).map((j) => ({ id: j.id, company: j.company, role: j.role })),
  };
}
