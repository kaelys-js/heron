/** Drafts the "3 times that work" reply when email-reactor classifies
 *  incoming email as interview-scheduling. Output: 3 slots in the next
 *  5 business days respecting user working-hours + timezone, plus an
 *  optional calendar link. Pure (only I/O is reading profile.yml).
 *  User reviews + sends from their mail client -- never auto-sent. */

import { readProfile } from './profile';

export type AvailabilitySlot = {
  /** ISO datetime in the user's timezone, e.g. 2026-05-15T10:00 */
  startIso: string;
  /** Localized label: "Tuesday May 13, 10:00 AM PT" */
  label: string;
};

export type AvailabilityReply = {
  subject: string;
  body: string;
  slots: AvailabilitySlot[];
  calendarUrl?: string;
  /** When set, the user should fix something before sending. */
  warning?: string;
};

/** Helper: format a Date in the user's timezone with day+time. */
function fmtSlot(d: Date, tz: string | undefined): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz || 'UTC',
    timeZoneName: 'short',
  };
  try {
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Find next N business days starting from "tomorrow" (skip weekends). */
function nextBusinessDays(count: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1); // start tomorrow
  while (out.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Pick 3 slot variations across the day from a given date: morning,
 *  mid-day, afternoon. Hours are in the user's local timezone. */
function slotsForDay(day: Date, workStartHour: number, workEndHour: number): Date[] {
  // 3 slots: workStart+1, midpoint, workEnd-2 (so a 60-min call fits)
  const midpoint = Math.floor((workStartHour + workEndHour) / 2);
  const hours = [workStartHour + 1, midpoint, workEndHour - 2];
  return hours.map((h) => {
    const d = new Date(day);
    d.setHours(h, 0, 0, 0);
    return d;
  });
}

/**
 * Build the availability reply for a profile. Pulls timezone + working
 * hours + optional calendar URL from profile.yml.
 *
 *   profile.yml.location.timezone        -- e.g. "America/Vancouver"
 *   profile.yml.location.working_hours   -- { start: 9, end: 17 }
 *                                          defaults: 9-17 local
 *   profile.yml.calendar_url             -- optional Calendly / Cal.com link
 */
export function draftAvailabilityReply(input: {
  profileId?: string;
  /** Optional: the recruiter's first name so we can address them. */
  recruiterFirstName?: string;
  /** Optional: the company name for the body. */
  company?: string;
  /** Optional: the role for the body. */
  role?: string;
  /** Optional: explicit timezone override. Falls back to profile. */
  timezone?: string;
}): AvailabilityReply {
  const profile = readProfile(input.profileId) as unknown as {
    candidate?: { full_name?: string };
    location?: { timezone?: string; working_hours?: { start?: number; end?: number } };
    calendar_url?: string;
  };
  const tz = input.timezone ?? profile?.location?.timezone ?? '';
  const wh = profile?.location?.working_hours ?? {};
  const startHour = typeof wh.start === 'number' ? wh.start : 9;
  const endHour = typeof wh.end === 'number' ? wh.end : 17;
  const calendarUrl = (profile as { calendar_url?: string })?.calendar_url;
  const candidateFirstName = (profile?.candidate?.full_name || '').split(' ')[0] || 'I';

  // Generate 3 slots across 2 business days for variety (today's tomorrow
  // + the day after). 6 slots total, but we surface only 3 -- the most
  // varied trio (1 morning, 1 mid, 1 afternoon, spread across days).
  const days = nextBusinessDays(3);
  // Pick: morning on day-1, midpoint on day-2, afternoon on day-3.
  const candidates: Date[] = [];
  const day1Slots = slotsForDay(days[0], startHour, endHour);
  const day2Slots = slotsForDay(days[1], startHour, endHour);
  const day3Slots = slotsForDay(days[2], startHour, endHour);
  candidates.push(day1Slots[0]); // morning
  candidates.push(day2Slots[1]); // midpoint
  candidates.push(day3Slots[2]); // afternoon

  const slots: AvailabilitySlot[] = candidates.map((d) => ({
    startIso: d.toISOString(),
    label: fmtSlot(d, tz),
  }));

  const recruiter = input.recruiterFirstName?.trim() || 'there';
  const ctxPhrase =
    input.role && input.company ? `the ${input.role} role at ${input.company}` : 'the role';

  const body = [
    `Hi ${recruiter},`,
    '',
    `Thanks for reaching out — I'd love to chat about ${ctxPhrase}.`,
    '',
    'A few times that work on my side (all ' + (tz ? tz : 'local time') + '):',
    ...slots.map((s) => `- ${s.label}`),
    '',
    'Happy to suggest more if none of these are good for you. Looking forward to it.',
    '',
    ...(calendarUrl ? [`Or grab any open slot directly: ${calendarUrl}`, ''] : []),
    'Best,',
    candidateFirstName,
  ].join('\n');

  const subject = `Re: ${input.company ?? 'your message'} — availability`;

  const warning = !tz
    ? 'No timezone set in profile.yml.location.timezone — slots shown in UTC. Recipients may misread.'
    : undefined;

  return { subject, body, slots, calendarUrl, warning };
}
