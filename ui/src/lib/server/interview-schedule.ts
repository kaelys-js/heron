/**
 * interview-schedule — per-job scheduledAt + reminder scheduler.
 *
 * Today the system knows a job is in PhoneScreen/Technical/Onsite/Final
 * status but NOT when the actual call is. The user might have a phone
 * screen Tuesday at 2pm and the dashboard never reminds them.
 *
 * This module:
 *   1. Stores scheduledAt per job in a small JSONL alongside other
 *      per-profile state (data/profiles/{slug}/interview-schedule.jsonl)
 *   2. Exposes set/get/list functions
 *   3. The reminder scheduler is a separate autopilot job (see
 *      interview-reminder.job.ts) that ticks every 15 minutes and
 *      surfaces high-priority activity events for jobs within T-30
 *      minutes or T-24 hours.
 *
 * The email-reactor can ALSO populate scheduledAt automatically when
 * an interview-scheduling email contains a parseable date/time (future
 * extension; today the user sets it manually via the JobActions menu).
 */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';

export type ScheduleEntry = {
  jobId: string;
  /** ms epoch when the interview is scheduled */
  scheduledAt: number;
  /** Interview stage (PhoneScreen / Technical / etc) */
  stage?: string;
  /** Optional: format (Zoom / Google Meet / in-person / phone) */
  format?: string;
  /** Optional: interviewer names + roles */
  interviewers?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
  /** Optional: notes the user wants in the reminder */
  notes?: string;
  /** Tracking — when this entry was set */
  setAt: number;
  /** Tracking — which reminders have fired already (T-24h, T-30min) */
  reminders?: { fired24h?: boolean; fired30min?: boolean };
};

function scheduleFile(profileId: string): string {
  return path.join(profilePath(profileId, 'profile-dir'), 'interview-schedule.jsonl');
}

/** Return all schedule entries for a profile, with last-write-wins on jobId. */
export function listSchedule(profileId: string): ScheduleEntry[] {
  const p = scheduleFile(profileId);
  if (!fs.existsSync(p)) return [];
  let txt = '';
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  const map = new Map<string, ScheduleEntry>();
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as ScheduleEntry;
      if (e.jobId) map.set(e.jobId, e);
    } catch {}
  }
  return [...map.values()].sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export function getSchedule(profileId: string, jobId: string): ScheduleEntry | null {
  return listSchedule(profileId).find((e) => e.jobId === jobId) ?? null;
}

export function setSchedule(
  profileId: string,
  entry: Omit<ScheduleEntry, 'setAt' | 'reminders'>,
): ScheduleEntry {
  const existing = getSchedule(profileId, entry.jobId);
  const next: ScheduleEntry = {
    ...entry,
    setAt: Date.now(),
    // Preserve fired-flags if the scheduledAt didn't change.
    reminders: existing && existing.scheduledAt === entry.scheduledAt ? existing.reminders : {},
  };
  const p = scheduleFile(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(next) + '\n');
  return next;
}

/** Mark a reminder as fired so the scheduler doesn't double-fire. */
export function markReminderFired(profileId: string, jobId: string, which: '24h' | '30min'): void {
  const e = getSchedule(profileId, jobId);
  if (!e) return;
  const reminders = { ...e.reminders };
  if (which === '24h') reminders.fired24h = true;
  if (which === '30min') reminders.fired30min = true;
  const p = scheduleFile(profileId);
  fs.appendFileSync(p, JSON.stringify({ ...e, reminders }) + '\n');
}

/** Identify jobs that need a reminder fired RIGHT NOW. Returns entries
 *  in the T-30min window (T+0 to T-30min, fired30min=false) and the
 *  T-24h window (T-23h to T-25h, fired24h=false). The reminder-job
 *  ticks every 15min and calls this. */
export function dueReminders(
  profileId: string,
  now: number = Date.now(),
): {
  thirtyMin: ScheduleEntry[];
  twentyFourHour: ScheduleEntry[];
} {
  const all = listSchedule(profileId);
  const thirtyMin: ScheduleEntry[] = [];
  const twentyFourHour: ScheduleEntry[] = [];
  for (const e of all) {
    const delta = e.scheduledAt - now;
    // T-30min window: 0 to +30 minutes from now (call is upcoming).
    // We use 0-35 to handle the 15-min tick cadence with some slack.
    if (!e.reminders?.fired30min && delta > 0 && delta <= 35 * 60 * 1000) {
      thirtyMin.push(e);
    }
    // T-24h window: 23-25 hours from now.
    if (!e.reminders?.fired24h && delta > 23 * 60 * 60 * 1000 && delta <= 25 * 60 * 60 * 1000) {
      twentyFourHour.push(e);
    }
  }
  return { thirtyMin, twentyFourHour };
}

/** Return upcoming interviews for the morning-digest job. Today the
 *  digest fires at 07:00; this returns anything between today's 07:00
 *  and the next 24 hours so the digest can mention "you have X at Y today". */
export function upcomingForDigest(profileId: string, now: number = Date.now()): ScheduleEntry[] {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime() + 24 * 60 * 60 * 1000;
  return listSchedule(profileId).filter((e) => e.scheduledAt >= now && e.scheduledAt <= cutoff);
}
