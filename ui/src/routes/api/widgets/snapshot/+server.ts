/**
 * /api/widgets/snapshot — single endpoint that feeds every iOS surface that
 * lives outside the WebView:
 *   • iPhone Home Screen widgets (HeronWidget, InboxIssuesWidget,
 *     NextInterviewWidget, TopApplyWidget)
 *   • Lock Screen accessory widgets
 *   • Apple Watch app + Smart Stack
 *   • Live Activities (next-interview countdown)
 *
 * Why a dedicated endpoint instead of stitching together /api/stats +
 * /api/issues + /api/interviews on the client: the iPhone-side
 * HeronNativePlugin.updateWidgets() pushes ONE blob into App Group
 * UserDefaults + ONE WCSession message to the Watch. Forcing the JS
 * caller to make three calls and combine them adds 100-200ms latency
 * on every widget refresh and three places to handle 401s. One round
 * trip, one shape.
 *
 * Auth: routed through hooks.server.ts's guard, so requests without a
 * session bounce to 401 before this handler runs. Per-user via the
 * AsyncLocalStorage user-context — every user sees only their own
 * queue / interviews / issues.
 *
 * Response shape mirrors what HeronNativePlugin.updateWidgets expects
 * (see plugin.swift's docstring for the key contract):
 *
 *   {
 *     ok: true,
 *     authenticated: true,
 *     stats: { queued, appliedToday, upcomingInterviews },
 *     nextInterview: { jobId, company, role, stage, scheduledAt (ISO),
 *                      interviewers[] } | null,
 *     topApply: { jobId, company, role, score, compBand, location,
 *                 portal } | null,
 *     openIssues: [{ id, severity, source, summary, ts }]
 *   }
 *
 * Empty state is fine — a fresh install with no jobs returns
 * stats={0,0,0}, nextInterview=null, topApply=null, openIssues=[].
 * The Swift widgets render the appropriate empty-state placeholders;
 * the auth gate (Task 2) handles the signed-out case via the bool flag.
 */
import { wrap } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { listSchedule } from '$lib/server/interview-schedule';
import { listOpenIssues } from '$lib/server/issues';
import { readProfiles } from '$lib/server/profiles';
import type { Job } from '$lib/types';

type WidgetStats = {
  queued: number;
  appliedToday: number;
  upcomingInterviews: number;
};

type WidgetInterview = {
  jobId: string;
  company: string;
  role: string;
  stage: string;
  /** ISO 8601 — Swift JSONDecoder decodes Date with ISO 8601 strategy */
  scheduledAt: string;
  interviewers: string[];
};

type WidgetTopApply = {
  jobId: string;
  company: string;
  role: string;
  score: number;
  compBand?: string;
  location?: string;
  portal?: string;
};

type WidgetIssue = {
  id: string;
  severity: 'info' | 'warn' | 'error';
  source: string;
  summary: string;
  /** ms epoch — Swift expects Double per IssueSnapshot.ts type */
  ts: number;
};

/** Pick the next chronologically-upcoming interview from the active profile. */
function pickNextInterview(profileId: string, jobs: Job[]): WidgetInterview | null {
  let schedule;
  try {
    schedule = listSchedule(profileId);
  } catch {
    return null;
  }
  const now = Date.now();
  const upcoming = schedule
    .filter((s) => s.scheduledAt >= now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
  if (upcoming.length === 0) return null;
  const next = upcoming[0];
  // ScheduleEntry stores `interviewers` as objects {name, role?, linkedinUrl?}
  // but the widget contract expects bare strings (the SwiftUI view just
  // renders them as a comma-joined list). Flatten to `name`.
  const interviewers = (next.interviewers ?? []).map((i) => i.name).filter((n): n is string => !!n);
  // Schedule entries don't carry company / role themselves — they reference
  // the job catalog by jobId. Look up the parent job to enrich; fall back to
  // sensible placeholders so the widget never renders "undefined".
  const job = jobs.find((j) => j.id === next.jobId);
  return {
    jobId: next.jobId,
    company: job?.company || 'Unknown company',
    role: job?.role || 'Unknown role',
    stage: next.stage || 'Interview',
    scheduledAt: new Date(next.scheduledAt).toISOString(),
    interviewers,
  };
}

/** Highest-scoring job in Queued / Scored state. Used by the
 *  TopApplyWidget single-candidate variants. */
function pickTopApply(jobs: Job[]): WidgetTopApply | null {
  let best: Job | null = null;
  let bestScore = -1;
  for (const j of jobs) {
    if (j.status !== 'Queued' && j.status !== 'Scored') continue;
    const score = j.score ?? j.geminiScore ?? 0;
    if (score > bestScore) {
      best = j;
      bestScore = score;
    }
  }
  if (!best) return null;
  return {
    jobId: best.id,
    company: best.company || 'Unknown',
    role: best.role || 'Unknown role',
    score: best.score ?? best.geminiScore ?? 0,
    compBand: best.salary || undefined,
    location: best.location || undefined,
    portal: best.source || undefined,
  };
}

/** Compact issue snapshot — only fields the Swift IssueSnapshot expects.
 *  Strips the rich `fix` payload (not used by the widget). */
function toWidgetIssue(issue: {
  id: string;
  severity: string;
  source: string;
  summary: string;
  ts: number;
}): WidgetIssue {
  const sev = issue.severity === 'error' || issue.severity === 'warn' ? issue.severity : 'info';
  return {
    id: issue.id,
    severity: sev,
    source: issue.source,
    summary: issue.summary,
    ts: issue.ts,
  };
}

export const GET = wrap('widgets-snapshot', async () => {
  const profileId = readProfiles().activeId;
  const jobs = loadAllJobs('all');

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

  let queued = 0;
  let appliedToday = 0;
  for (const job of jobs) {
    if (job.status === 'Queued' || job.status === 'Applying') queued++;
    const lastEvent = (job as Job & { lastEvent?: number }).lastEvent;
    if (job.status === 'Applied' && lastEvent && lastEvent >= dayStart) {
      appliedToday++;
    }
  }

  let upcomingInterviews = 0;
  try {
    const schedule = listSchedule(profileId);
    for (const entry of schedule) {
      if (entry.scheduledAt >= now && entry.scheduledAt <= weekFromNow) upcomingInterviews++;
    }
  } catch {
    // Schedule store missing on a fresh install — already counted as 0.
  }

  const stats: WidgetStats = { queued, appliedToday, upcomingInterviews };
  const nextInterview = pickNextInterview(profileId, jobs);
  const topApply = pickTopApply(jobs);
  // Cap to 8 — widgets only ever show 5 (large InboxIssuesWidget) but
  // keep a small buffer so the next refresh has something to dedupe.
  const openIssues = listOpenIssues().slice(0, 8).map(toWidgetIssue);

  return {
    ok: true,
    authenticated: true,
    stats,
    nextInterview,
    topApply,
    openIssues,
  };
});
