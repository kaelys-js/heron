/** /api/stats -- counters for tray icon + iOS widget + Live Activity.
 *  Cheap: in-memory cache aggregation, no FS walks / Claude calls --
 *  tray polls every 30s, widget every 15min, must be sub-50ms.
 *  Reply: { queued, appliedToday, upcomingInterviews, autopilotPaused }. */
import { wrap } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { readConfig as readAutopilotConfig } from '$lib/server/autopilot';
import { listSchedule } from '$lib/server/interview-schedule';
import { readProfiles } from '$lib/server/profiles';

export const GET = wrap('stats', async () => {
  const profileId = readProfiles().activeId;
  const jobs = loadAllJobs('all');
  let queued = 0;
  let appliedToday = 0;
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  for (const job of jobs) {
    if (job.status === 'Queued' || job.status === 'Applying') queued++;
    if (job.status === 'Applied' && (job as any).lastEvent && (job as any).lastEvent >= dayStart) {
      appliedToday++;
    }
  }

  // Upcoming interviews this week
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
  let upcomingInterviews = 0;
  try {
    const schedule = listSchedule(profileId);
    for (const entry of schedule) {
      if (entry.scheduledAt >= now && entry.scheduledAt <= weekFromNow) upcomingInterviews++;
    }
  } catch {
    /* schedule store may be empty on fresh installs */
  }

  // Autopilot paused?
  const autopilot = readAutopilotConfig();
  const autopilotPaused = (autopilot as any).paused === true;

  return { ok: true, queued, appliedToday, upcomingInterviews, autopilotPaused };
});
