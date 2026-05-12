/**
 * interview-reminder — ticks every 15 minutes; emits high-priority events
 * for jobs within T-30min or T-24h of a scheduled interview.
 *
 * These events flow through the standard activity-feed → SSE → OS
 * notification pipeline. Result: the user gets a desktop ping 30
 * minutes before any scheduled call.
 *
 * Trigger: `interval` with every-15-minutes. The autopilot's daily-
 * trigger model doesn't fit this; we register with a custom polling
 * cadence handled by the same setInterval pattern as scan-email-imap.
 */

import { register } from './registry';
import { listProfiles } from '../profiles';
import { dueReminders, markReminderFired } from '../interview-schedule';
import { logEvent } from '../events';
import type { JobResult } from './types';

async function runInterviewReminder(): Promise<JobResult> {
  const profiles = listProfiles();
  let firedThirtyMin = 0;
  let firedTwentyFourHour = 0;

  for (const p of profiles) {
    const due = dueReminders(p.id);

    for (const entry of due.thirtyMin) {
      const minutesLeft = Math.max(0, Math.round((entry.scheduledAt - Date.now()) / (60 * 1000)));
      logEvent('interview-reminder', '⏰ Interview in ' + minutesLeft + ' min', {
        level: 'warn',
        category: 'application',
        message:
          (entry.stage ? entry.stage + ' · ' : '') +
          (entry.format ? entry.format + ' · ' : '') +
          'Open the job\'s dossier + comp-preflight before the call. ' +
          (entry.interviewers && entry.interviewers.length > 0
            ? 'Interviewer(s): ' + entry.interviewers.map((i) => i.name).join(', ')
            : ''),
        link: '/job/' + encodeURIComponent(entry.jobId),
        profileId: p.id,
      });
      markReminderFired(p.id, entry.jobId, '30min');
      firedThirtyMin++;
    }

    for (const entry of due.twentyFourHour) {
      logEvent('interview-reminder', '📅 Interview tomorrow', {
        level: 'info',
        category: 'application',
        message:
          (entry.stage ? entry.stage + ' · ' : '') +
          new Date(entry.scheduledAt).toLocaleString() +
          '. Generate the pre-call dossier today if you haven\'t; mock the stage tonight.',
        link: '/job/' + encodeURIComponent(entry.jobId),
        profileId: p.id,
      });
      markReminderFired(p.id, entry.jobId, '24h');
      firedTwentyFourHour++;
    }
  }

  return {
    ok: true,
    message: 'Reminders fired: ' + firedThirtyMin + '× T-30min + ' + firedTwentyFourHour + '× T-24h',
    meta: { firedThirtyMin, firedTwentyFourHour },
  };
}

register({
  id: 'interview-reminder',
  label: 'Interview reminder watcher',
  description: 'Every 15min, checks scheduled interviews and fires T-30min + T-24h reminders.',
  category: 'system',
  // The autopilot tick is daily-only; we still register here so the
  // job exists in the registry + can be triggered manually from /agents.
  // The actual 15-min cadence is handled by a setInterval daemon in
  // orchestrator boot (see installInterviewReminderDaemon below).
  trigger: { type: 'daily', hour: 9, minute: 0 },
  allowManual: true,
  run: runInterviewReminder,
});

// Daemon: tick every 15 min from server boot. Mirrors the IMAP poller
// pattern (see scan-email-imap.job.ts:installImapPollerDaemon).
const TICK_MS = 15 * 60 * 1000;
let installed = false;

export function installInterviewReminderDaemon(): void {
  if (installed) return;
  installed = true;
  // Initial tick after a short delay (let server finish booting).
  setTimeout(() => {
    runInterviewReminder().catch(() => { /* logged inside */ });
    setInterval(() => { runInterviewReminder().catch(() => {}); }, TICK_MS);
  }, 30_000);
}
