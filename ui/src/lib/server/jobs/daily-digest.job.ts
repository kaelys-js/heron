/** Daily digest -- once-per-day rollup of today's operationally
 *  meaningful changes: applications fired (Applied today), auto-
 *  queued, interviews scheduled/advanced, offers, rejections,
 *  follow-ups due/overdue (from cadence wrapper), new patterns
 *  (info-severity issues from recompute-patterns), errors in last 24h.
 *  Emits one info-level activity event with a one-liner so the bell
 *  shows it without spamming the feed. Re-emit-safe.
 *  Default trigger: daily 18:00 local; allowManual=true for /agents. */

import { loadAllJobs } from '../parsers';
import { logEvent, bus } from '../events';
import { listOpenIssues } from '../issues';
import { getFollowupCadence } from '../followup-cadence';
import { register } from './registry';
import { currentUserIdOrDefault } from '../user-context';
import type { JobResult } from './types';
import type { ActivityEvent, Job } from '$lib/types';

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function todayCount(events: ActivityEvent[], match: (ev: ActivityEvent) => boolean): number {
  return events.filter((ev) => isToday(ev.ts) && match(ev)).length;
}

async function runDailyDigest(): Promise<JobResult> {
  try {
    const jobs = loadAllJobs();
    // F25 -- scope events to THIS user. The digest is per-user (registered
    // `perUser:true`, runs inside runAsUser(userId, …)). Calling
    // `bus.recent()` instead of `bus.recentForUser()` would return events
    // for every user, so user A's "Applied" events would land in user B's
    // digest delta.
    const events = bus.recentForUser(currentUserIdOrDefault());

    // Status snapshot
    const queued = jobs.filter((j: Job) => j.status === 'Queued').length;
    const interviews = jobs.filter((j: Job) => j.status === 'Interview').length;
    const offers = jobs.filter((j: Job) => j.status === 'Offer').length;

    // Today's deltas (best-effort from activity feed -- applications.md doesn't
    // store a "modified" timestamp per row, so we rely on the events the
    // dashboard emits for status flips.)
    const appliedToday = todayCount(
      events,
      (ev) =>
        ev.category === 'application' && /\bApplied\b/.test(ev.title + ' ' + (ev.message ?? '')),
    );
    const queuedToday = todayCount(
      events,
      (ev) => ev.source === 'auto-queue' && ev.title.toLowerCase().includes('queued'),
    );
    const rejectedToday = todayCount(events, (ev) =>
      /\bRejected\b/.test(ev.title + ' ' + (ev.message ?? '')),
    );
    const errorsToday = todayCount(events, (ev) => ev.level === 'error');

    // Follow-up cadence -- best-effort. Skip if the script chokes.
    let followupsUrgent = 0;
    let followupsOverdue = 0;
    try {
      const cadence = await getFollowupCadence();
      for (const e of cadence.entries) {
        if (e.urgency === 'urgent') followupsUrgent += 1;
        else if (e.urgency === 'overdue') followupsOverdue += 1;
      }
    } catch {
      // tolerated -- digest stays useful without cadence
    }

    // Pattern detection emits 'info' issues with a "pattern" keyword
    // in the summary -- surface count in the digest line.
    const open = listOpenIssues();
    const newPatterns = open.filter(
      (i) => i.severity === 'info' && /pattern/i.test(i.summary),
    ).length;

    // Compose the one-liner
    const parts: string[] = [];
    parts.push(appliedToday + ' applied');
    if (queuedToday > 0) parts.push(queuedToday + ' queued');
    if (interviews > 0)
      parts.push(interviews + ' active interview' + (interviews === 1 ? '' : 's'));
    if (offers > 0) parts.push(offers + ' offer' + (offers === 1 ? '' : 's'));
    if (followupsUrgent + followupsOverdue > 0) {
      parts.push(
        followupsUrgent +
          followupsOverdue +
          ' follow-up' +
          (followupsUrgent + followupsOverdue === 1 ? '' : 's') +
          ' due',
      );
    }
    if (rejectedToday > 0) parts.push(rejectedToday + ' rejected');
    if (errorsToday > 0) parts.push(errorsToday + ' error' + (errorsToday === 1 ? '' : 's'));
    if (newPatterns > 0) parts.push(newPatterns + ' new pattern' + (newPatterns === 1 ? '' : 's'));

    const summary = parts.length > 0 ? parts.join(' · ') : 'nothing changed';

    const isQuiet =
      appliedToday === 0 &&
      queuedToday === 0 &&
      rejectedToday === 0 &&
      errorsToday === 0 &&
      followupsUrgent + followupsOverdue === 0;

    logEvent('daily-digest', isQuiet ? 'Today: nothing changed' : 'Today: ' + summary, {
      level: 'info',
      category: 'system',
      message:
        'Snapshot · queued=' + queued + ' · interviews=' + interviews + ' · offers=' + offers,
    });

    return {
      ok: true,
      message: summary,
      meta: {
        appliedToday,
        queuedToday,
        rejectedToday,
        errorsToday,
        interviews,
        offers,
        queued,
        followupsUrgent,
        followupsOverdue,
        newPatterns,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('daily-digest', 'Digest failed', {
      level: 'error',
      category: 'system',
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

register({
  id: 'daily-digest',
  label: 'Daily digest',
  description:
    'Morning rollup of applications, queued jobs, interviews, follow-ups, errors, and new patterns.',
  category: 'insight',
  trigger: { type: 'daily', hour: 7, minute: 0 },
  allowManual: true,
  perUser: true,
  run: runDailyDigest,
});
