/**
 * POST /api/calendar/sync
 *
 * Return an iCalendar (.ics) feed of the user's interviews + prep blocks +
 * decision deadlines for the next 60 days. The Capacitor app (iOS / macOS)
 * subscribes the OS calendar to this URL so events show up natively.
 *
 * Body: { calendarUrl?: string }   — when provided, the server records
 *   the URL so a future push-notification can fire if the calendar feed
 *   subscription is broken (P10 follow-up). Not required to fetch the feed.
 *
 * The feed is read-only — we never write back to the OS calendar. One-way
 * push only. If the user wants to delete an event, they edit it on the
 * career-ops side.
 */

import { wrap } from '$lib/server/api-helpers';
import { findUpcomingInterviews } from '$lib/server/interviewers';
import { listActiveOffers } from '$lib/server/offers';
import { getActiveProfileId } from '$lib/server/profiles';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

const HOUR_MS = 60 * 60 * 1000;
const HOURS_24 = 24 * HOUR_MS;
const HOURS_48 = 48 * HOUR_MS;

function fmt(d: Date): string {
  // RFC 5545 DTSTAMP / DTSTART / DTEND — UTC basic format YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildIcs(
  events: {
    uid: string;
    start: number;
    end: number;
    summary: string;
    description?: string;
    url?: string;
  }[],
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//career-ops//interview-feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:career-ops · interviews',
    'X-WR-CALDESC:Interviews\\, prep blocks\\, and offer deadlines',
  ];
  const now = fmt(new Date());
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.uid + '@career-ops');
    lines.push('DTSTAMP:' + now);
    lines.push('DTSTART:' + fmt(new Date(ev.start)));
    lines.push('DTEND:' + fmt(new Date(ev.end)));
    lines.push('SUMMARY:' + escapeText(ev.summary));
    if (ev.description) lines.push('DESCRIPTION:' + escapeText(ev.description));
    if (ev.url) lines.push('URL:' + ev.url);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export const GET = async ({ url }: { url: URL }) => {
  const profileId = getActiveProfileId();
  const horizonDays = 60;
  const events: {
    uid: string;
    start: number;
    end: number;
    summary: string;
    description?: string;
    url?: string;
  }[] = [];

  for (const { jobId, interviewer } of findUpcomingInterviews(horizonDays, profileId)) {
    if (!interviewer.scheduledAt) continue;
    const job = resolveJobAndProfile(jobId, url)?.job;
    const company = job?.company ?? '?';
    const role = job?.role ?? '?';
    events.push({
      uid: 'iv-' + jobId + '-' + interviewer.slug,
      start: interviewer.scheduledAt,
      end: interviewer.scheduledAt + HOUR_MS,
      summary: company + ' — ' + interviewer.stage + ' · ' + interviewer.name,
      description:
        role +
        '\n' +
        (interviewer.dossierPath ? 'Dossier ready' : 'NO dossier yet — research first.'),
      url: url.origin + '/job/' + jobId + '#interviewer-' + interviewer.slug,
    });
    const leadMs =
      interviewer.stage === 'onsite' || interviewer.stage === 'final-round' ? HOURS_48 : HOURS_24;
    events.push({
      uid: 'prep-' + jobId + '-' + interviewer.slug,
      start: interviewer.scheduledAt - leadMs,
      end: interviewer.scheduledAt - leadMs + HOUR_MS,
      summary: '🔍 PREP · ' + company + ' / ' + interviewer.name,
      description:
        'Read dossier + run mock drill before ' +
        new Date(interviewer.scheduledAt).toLocaleString(),
      url: url.origin + '/job/' + jobId + '#interviewer-' + interviewer.slug,
    });
  }
  for (const offer of listActiveOffers(profileId)) {
    if (!offer.decisionDeadline) continue;
    const job = resolveJobAndProfile(offer.jobId, url)?.job;
    events.push({
      uid: 'decision-' + offer.jobId,
      start: offer.decisionDeadline,
      end: offer.decisionDeadline + HOUR_MS,
      summary: '⏰ Offer decision · ' + (job?.company ?? '?'),
      description: 'Recruiter wants an answer by this time.',
      url: url.origin + '/job/' + offer.jobId + '#offer',
    });
  }
  const ics = buildIcs(events);
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="career-ops-interviews.ics"',
      'cache-control': 'max-age=300',
    },
  });
};

/** POST is reserved for the future "calendarUrl subscription validator". Today
 *  it just echoes ok so the mobile app can hit it to test the auth flow. */
export const POST = wrap('calendar-sync', async () => {
  return { ok: true };
});
