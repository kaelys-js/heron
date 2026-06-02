import { loadAllJobs } from '$lib/server/parsers';
import { bus } from '$lib/server/events';
import { listRunning } from '$lib/server/orchestrator';
import { readEnv, loadEnv } from '$lib/server/env';
import { readSafe } from '$lib/server/files';
import { activePath, profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId } from '$lib/server/profiles';
import { readProfile } from '$lib/server/profile';
import {
  getFollowupCadence,
  findEntryByCompanyRole,
  type FollowupEntry,
} from '$lib/server/followup-cadence';
import { listOpenIssues } from '$lib/server/issues';
import { listLeads } from '$lib/server/email-reactor';
import { findThankYousOwed, findUpcomingInterviews } from '$lib/server/interviewers';
import { listAllStageState, listStaleJobs } from '$lib/server/stage-state';
import { listActiveOffers } from '$lib/server/offers';
import { currentUserIdOrDefault } from '$lib/server/user-context';
import fs from 'node:fs';
import type { Job, ActivityEvent, Status } from '$lib/types';

loadEnv();

const DAY_MS = 24 * 60 * 60 * 1000;

type AppliedRow = { date: string; company: string; status: string };

function parseAppliedRows(profileId?: string): AppliedRow[] {
  const txt = readSafe(
    profileId && profileId !== 'all'
      ? profilePath(profileId, 'applications')
      : activePath('applications'),
  );
  const rows: AppliedRow[] = [];
  for (const line of txt.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const date = cells[2];
    const company = cells[3] ?? '';
    // Status column position varies (11 vs 12 cols) -- same logic as parsers.ts
    let status: string = '';
    if (cells.length >= 12) status = cells[8] ?? '';
    else if (cells.length >= 11) status = cells[7] ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) rows.push({ date, company, status });
  }
  return rows;
}

function velocityBuckets(rows: AppliedRow[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + 1);
  const out: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

export type InboxAlert = {
  id: string;
  level: 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  actionLabel?: string;
  actionUrl?: string;
  /** orchestrator task to spawn via /api/run when actionLabel clicked */
  actionTask?: 'scan' | 'gemini' | 'apply-linkedin';
  /** When set, clicking the actionLabel POSTs here (used by autopilot resume). */
  actionPostUrl?: string;
};

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());
  const jobs = loadAllJobs(profileId);
  const env = readEnv();
  // F25 -- scope events to THIS user. /inbox renders an "activity" panel
  // that previously bled other users' task events (Bob's scan-portals
  // finished events appearing on Alice's inbox).
  const recent = bus.recentForUser(currentUserIdOrDefault());
  const running = listRunning();
  const profile = readProfile(profileId === 'all' ? undefined : profileId);

  // Pipeline freshness
  let pipelineMtime: number | null = null;
  try {
    const pipelinePath =
      profileId && profileId !== 'all'
        ? profilePath(profileId, 'pipeline')
        : activePath('pipeline');
    pipelineMtime = fs.statSync(pipelinePath).mtimeMs;
  } catch {
    // No pipeline file yet (fresh install) -- leave mtime null, the
    // "Last scan" badge just won't render.
  }
  const pipelineDaysAgo = pipelineMtime ? Math.floor((Date.now() - pipelineMtime) / DAY_MS) : null;

  // Sort helper
  const byScore = (a: Job, b: Job) =>
    (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1);

  // Section: jobs ≥ 4 awaiting deep evaluation (Scored/New, no report)
  const upNext = jobs
    .filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && !j.reportFile)
    .sort(byScore)
    .slice(0, 6);
  const upNextTotal = jobs.filter(
    (j) => (j.score ?? j.geminiScore ?? 0) >= 4 && !j.reportFile,
  ).length;

  // Section: jobs in Ready
  const ready = jobs
    .filter((j) => j.status === 'Ready')
    .sort(byScore)
    .slice(0, 6);
  const readyTotal = jobs.filter((j) => j.status === 'Ready').length;

  // Section: in flight (Interview / Offer)
  const inFlightAll = jobs
    .filter((j) => j.status === 'Interview' || j.status === 'Offer')
    .sort(byScore);
  const inFlight = inFlightAll.slice(0, 6);

  // Section: applied awaiting follow-up (Applied/Screened, sorted by recency in source)
  const followUps = jobs
    .filter((j) => j.status === 'Applied' || j.status === 'Screened')
    .sort(byScore)
    .slice(0, 6);
  const followUpsTotal = jobs.filter(
    (j) => j.status === 'Applied' || j.status === 'Screened',
  ).length;

  // Counts
  const unscored = jobs.filter((j) => !j.score && !j.geminiScore).length;
  const totalApps = jobs.filter((j) =>
    (['Applied', 'Screened', 'Interview', 'Offer', 'Rejected'] as Status[]).includes(j.status),
  ).length;

  // Velocity
  const appliedRows = parseAppliedRows(profileId);
  const velocity = velocityBuckets(appliedRows);
  const last7 = velocity.slice(-7).reduce((a, b) => a + b.count, 0);
  const prev7 = velocity.slice(0, 7).reduce((a, b) => a + b.count, 0);
  const velocityDeltaPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  // Top sources from current pipeline
  const sourceCounts = new Map<string, number>();
  for (const j of jobs) {
    let src = 'Other';
    try {
      const host = new URL(j.url).hostname.replace(/^www\./, '');
      if (host.includes('linkedin')) src = 'LinkedIn';
      else if (host.includes('indeed')) src = 'Indeed';
      else if (host.includes('greenhouse')) src = 'Greenhouse';
      else if (host.includes('ashby')) src = 'Ashby';
      else if (host.includes('lever')) src = 'Lever';
      else if (host.includes('glassdoor')) src = 'Glassdoor';
      else if (host.includes('themuse')) src = 'The Muse';
      else if (host.includes('remoteok')) src = 'RemoteOK';
      else if (host.includes('weworkremotely')) src = 'WeWorkRemotely';
      else if (host.includes('hnrss') || host.includes('news.ycombinator')) src = 'HN Hiring';
      else src = host.split('.').slice(-2, -1)[0] ?? 'Other';
    } catch {
      // URL constructor threw on a malformed job URL -- keep the default
      // 'Other' bucket so the source breakdown still renders.
    }
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Recent activity (last 14, newest first). This is the raw event log
  // (product + technical), shown verbatim for visibility -- it is NOT an
  // alert source. R6: we no longer derive a "Recent error" Inbox ALERT from
  // technical activity events. A 5xx / render crash is a technical diagnostic
  // (it lands in the diagnostics sink + Runtimes), not a product alert that
  // belongs alongside apply-failures and offer deadlines. Inbox alerts come
  // exclusively from product issues (listOpenIssues) + product cards below.
  const activity: ActivityEvent[] = [...recent].slice(-14).reverse();

  // Alerts
  const alerts: InboxAlert[] = [];
  // Circuit-breaker takes precedence -- surface at the top so the user always
  // sees the operationally most-blocking thing first.
  const openIssues = listOpenIssues();
  const breakerIssue = openIssues.find((i) => i.dedupeKey === 'autopilot-circuit-breaker');
  if (breakerIssue) {
    alerts.push({
      id: 'circuit-breaker',
      level: 'error',
      title: breakerIssue.summary,
      message: breakerIssue.detail,
      actionLabel: 'Resume autopilot',
      actionPostUrl: '/api/autopilot/resume',
    });
  }

  // Apply-failure issues -- emitted by reportApplyFailure() whenever an
  // autonomous-apply run hits a soft block (CAPTCHA, anti-bot, unknown
  // form field, stub-portal, upload-failed, validation, error). Each
  // has dedupeKey `apply:{jobId}` so retries don't accumulate.
  const applyIssues = openIssues
    .filter((i) => (i.dedupeKey ?? '').startsWith('apply:'))
    .map((i) => ({
      id: i.id,
      severity: i.severity,
      summary: i.summary,
      detail: i.detail,
      fix: i.fix,
      jobId: (i.dedupeKey ?? '').slice('apply:'.length),
      source: i.source, // e.g. 'apply-greenhouse', 'apply-stub'
      ts: i.ts,
    }))
    .sort((a, b) => b.ts - a.ts);
  if (pipelineDaysAgo != null && pipelineDaysAgo >= 7) {
    alerts.push({
      id: 'stale-pipeline',
      level: 'warning',
      title: 'Pipeline is ' + pipelineDaysAgo + ' days old',
      message: 'Run a fresh scan to find new jobs across all 7 sources.',
      actionLabel: 'Run scan',
      actionTask: 'scan',
    });
  }
  // Screenshot mode runs in a sealed tmpdir + never calls Anthropic /
  // Gemini, so the "key not set" CTAs are inbox noise that pollutes
  // README captures. Suppress in screenshot mode only -- real users
  // still see the prompts.
  const screenshotMode = process.env.HERON_SCREENSHOT_MODE === '1';
  if (!env.ANTHROPIC_API_KEY && !screenshotMode) {
    alerts.push({
      id: 'no-anthropic',
      level: 'info',
      title: 'Anthropic key not set',
      message:
        'Required for deep evaluations, agent chat, mock interviews, and negotiation drafts.',
      actionLabel: 'Add key',
      actionUrl: '/settings',
    });
  }
  if (!env.GEMINI_API_KEY && !screenshotMode) {
    alerts.push({
      id: 'no-gemini',
      level: 'info',
      title: 'Gemini key not set',
      message: 'Free tier covers ~1M tokens/day — required for cheap first-pass scoring.',
      actionLabel: 'Add key',
      actionUrl: '/settings',
    });
  } else if (unscored > 50) {
    alerts.push({
      id: 'unscored',
      level: 'info',
      title: unscored + ' unscored jobs awaiting Gemini',
      message: 'Run a first-pass to triage them down to the high-fit ones.',
      actionLabel: 'Score now',
      actionTask: 'gemini',
    });
  }

  const firstName = (profile.candidate?.full_name ?? '').split(' ')[0] || '';

  // Follow-up cadence -- best-effort. If the script chokes (no tracker yet,
  // missing Node), the page renders without the urgent-followups section.
  let followupsUrgent: { job: Job; entry: FollowupEntry }[] = [];
  let followupsOverdue: { job: Job; entry: FollowupEntry }[] = [];
  let followupsCadenceMeta: Awaited<ReturnType<typeof getFollowupCadence>>['metadata'] | null =
    null;
  try {
    const cadence = await getFollowupCadence();
    followupsCadenceMeta = cadence.metadata;
    const activeJobs = jobs.filter((j) =>
      ['Applied', 'Screened', 'Interview', 'Offer'].includes(j.status),
    );
    for (const j of activeJobs) {
      const entry = findEntryByCompanyRole(cadence, j.company, j.role);
      if (!entry) continue;
      if (entry.urgency === 'urgent') followupsUrgent.push({ job: j, entry });
      else if (entry.urgency === 'overdue') followupsOverdue.push({ job: j, entry });
    }
    // Cap to keep the section scannable; full list lives on /applied
    followupsUrgent = followupsUrgent.slice(0, 6);
    followupsOverdue = followupsOverdue.slice(0, 6);
  } catch {
    // Silent -- Inbox stays usable even if cadence parsing fails
  }

  // Inbound recruiter leads -- emails the reactor classified as
  // `recruiter-reach-out` (no prior tracker match). Highest-converting
  // channel historically; surface up.
  const leads = (() => {
    try {
      return listLeads().slice(0, 10);
    } catch {
      return [];
    }
  })();

  // Post-apply pipeline cards -- derived from the JSON sidecars on every
  // request (no persistence). Six kinds: thank-you-owed, follow-up-due,
  // prep-block-recommended, offer-decision-due, ghosted-flagged,
  // next-action-due. See /api/inbox/cards for the same logic exposed as
  // an endpoint (mobile + Watch consumers). Surface here as inline cards.
  type PostApplyCard = {
    id: string;
    kind:
      | 'thank-you-owed'
      | 'follow-up-due'
      | 'prep-block-recommended'
      | 'offer-decision-due'
      | 'ghosted-flagged'
      | 'next-action-due';
    jobId: string;
    title: string;
    description: string;
    dueAt: number;
    cta?: { label: string; href: string };
  };
  const postApplyCards: PostApplyCard[] = [];
  const scopeId = profileId === 'all' ? getActiveProfileId() : profileId;
  const now = Date.now();
  try {
    for (const { jobId, interviewer } of findThankYousOwed(scopeId)) {
      if (!interviewer.scheduledAt) continue;
      postApplyCards.push({
        id: `thank-you:${jobId}:${interviewer.slug}`,
        kind: 'thank-you-owed',
        jobId,
        title: `Thank-you owed: ${interviewer.name}`,
        description: 'Send within 48h of the interview.',
        dueAt: interviewer.scheduledAt + 48 * 60 * 60 * 1000,
        cta: { label: 'Draft thank-you', href: `/job/${jobId}#thank-you-${interviewer.slug}` },
      });
    }
    for (const { jobId, interviewer, daysAway } of findUpcomingInterviews(5, scopeId)) {
      if (interviewer.dossierPath) continue;
      postApplyCards.push({
        id: `prep:${jobId}:${interviewer.slug}`,
        kind: 'prep-block-recommended',
        jobId,
        title: `Prep ${interviewer.name} (${daysAway}d)`,
        description: 'No dossier yet — run deep research.',
        dueAt: interviewer.scheduledAt!,
        cta: { label: 'Generate dossier', href: `/job/${jobId}#interviewer-${interviewer.slug}` },
      });
    }
    for (const { jobId, daysSinceLastTouch } of listStaleJobs(21, scopeId)) {
      postApplyCards.push({
        id: `ghost:${jobId}`,
        kind: 'ghosted-flagged',
        jobId,
        title: `Silent for ${daysSinceLastTouch}d`,
        description: 'Mark Ghosted or send a final follow-up.',
        dueAt: now,
        cta: { label: 'Decide', href: `/job/${jobId}#followup` },
      });
    }
    for (const offer of listActiveOffers(scopeId)) {
      if (!offer.decisionDeadline) continue;
      const ms = offer.decisionDeadline - now;
      if (ms < 0 || ms > 72 * 60 * 60 * 1000) continue;
      postApplyCards.push({
        id: `offer-decide:${offer.jobId}`,
        kind: 'offer-decision-due',
        jobId: offer.jobId,
        title: `Offer decision in ${Math.ceil(ms / (60 * 60 * 1000))}h`,
        description: `Answer by ${new Date(offer.decisionDeadline).toLocaleString()}`,
        dueAt: offer.decisionDeadline,
        cta: { label: 'Open offer', href: `/job/${offer.jobId}#offer` },
      });
    }
    const stage = listAllStageState(scopeId);
    for (const [jobId, state] of Object.entries(stage)) {
      if (!state.nextActionDue) continue;
      postApplyCards.push({
        id: `next:${jobId}:${state.nextActionDue.kind}`,
        kind: 'next-action-due',
        jobId,
        title: `${state.nextActionDue.kind.replace('-', ' ')} due`,
        description: state.nextActionDue.note ?? 'Manual action you scheduled.',
        dueAt: state.nextActionDue.dueAt,
        cta: { label: 'Open job', href: `/job/${jobId}` },
      });
    }
  } catch {
    /* keep Inbox usable on parse failures */
  }
  postApplyCards.sort((a, b) => a.dueAt - b.dueAt);

  return {
    profileId,
    firstName,
    nowISO: new Date().toISOString(),
    inboundLeads: leads,
    upNext,
    upNextTotal,
    ready,
    readyTotal,
    inFlight,
    inFlightTotal: inFlightAll.length,
    followUps,
    followUpsTotal,
    counts: {
      totalJobs: jobs.length,
      unscored,
      totalApps,
      activeCount: followUpsTotal + inFlightAll.length,
    },
    velocity,
    last7,
    prev7,
    velocityDeltaPct,
    topSources,
    activity,
    pipelineDaysAgo,
    alerts,
    applyIssues,
    followupsUrgent,
    followupsOverdue,
    followupsCadenceMeta,
    postApplyCards,
    runtime: {
      hasAnthropic: !!env.ANTHROPIC_API_KEY,
      hasGemini: !!env.GEMINI_API_KEY,
      runningTasks: running,
    },
  };
}
