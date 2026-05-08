import { loadAllJobs } from '$lib/server/parsers';
import { bus } from '$lib/server/events';
import { listRunning } from '$lib/server/orchestrator';
import { readEnv, loadEnv } from '$lib/server/env';
import { PIPELINE, APPLICATIONS, readSafe } from '$lib/server/files';
import { readProfile } from '$lib/server/profile';
import { getFollowupCadence, findEntryByCompanyRole, type FollowupEntry } from '$lib/server/followup-cadence';
import { listOpenIssues } from '$lib/server/issues';
import fs from 'node:fs';
import type { Job, ActivityEvent, Status } from '$lib/types';

loadEnv();

const DAY_MS = 24 * 60 * 60 * 1000;

type AppliedRow = { date: string; company: string; status: string };

function parseAppliedRows(): AppliedRow[] {
  const txt = readSafe(APPLICATIONS);
  const rows: AppliedRow[] = [];
  for (const line of txt.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const date = cells[2];
    const company = cells[3] ?? '';
    // Status column position varies (11 vs 12 cols) — same logic as parsers.ts
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

export async function load() {
  const jobs = loadAllJobs();
  const env = readEnv();
  const recent = bus.recent();
  const running = listRunning();
  const profile = readProfile();

  // Pipeline freshness
  let pipelineMtime: number | null = null;
  try { pipelineMtime = fs.statSync(PIPELINE).mtimeMs; } catch {}
  const pipelineDaysAgo = pipelineMtime ? Math.floor((Date.now() - pipelineMtime) / DAY_MS) : null;

  // Sort helper
  const byScore = (a: Job, b: Job) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1);

  // Section: jobs ≥ 4 awaiting deep evaluation (Scored/New, no report)
  const upNext = jobs
    .filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && !j.reportFile)
    .sort(byScore)
    .slice(0, 6);
  const upNextTotal = jobs.filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && !j.reportFile).length;

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
  const followUpsTotal = jobs.filter((j) => j.status === 'Applied' || j.status === 'Screened').length;

  // Counts
  const unscored = jobs.filter((j) => !j.score && !j.geminiScore).length;
  const totalApps = jobs.filter((j) =>
    (['Applied', 'Screened', 'Interview', 'Offer', 'Rejected'] as Status[]).includes(j.status),
  ).length;

  // Velocity
  const appliedRows = parseAppliedRows();
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
    } catch {}
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Recent activity (last 14, newest first)
  const activity: ActivityEvent[] = [...recent].slice(-14).reverse();
  const recentErrorsCount = recent.filter(
    (ev) => ev.level === 'error' && Date.now() - ev.ts < DAY_MS,
  ).length;
  const lastError = [...recent].reverse().find((ev) => ev.level === 'error' && Date.now() - ev.ts < DAY_MS) ?? null;

  // Alerts
  const alerts: InboxAlert[] = [];
  // Circuit-breaker takes precedence — surface at the top so the user always
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
  if (lastError) {
    alerts.push({
      id: 'recent-error',
      level: 'error',
      title: 'Recent error: ' + lastError.title,
      message: lastError.message,
      actionLabel: 'Open Runtimes',
      actionUrl: '/runtimes',
    });
  }
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
  if (!env.ANTHROPIC_API_KEY) {
    alerts.push({
      id: 'no-anthropic',
      level: 'info',
      title: 'Anthropic key not set',
      message: 'Required for deep evaluations, agent chat, mock interviews, and negotiation drafts.',
      actionLabel: 'Add key',
      actionUrl: '/settings',
    });
  }
  if (!env.GEMINI_API_KEY) {
    alerts.push({
      id: 'no-gemini',
      level: 'info',
      title: 'Gemini key not set',
      message: "Free tier covers ~1M tokens/day — required for cheap first-pass scoring.",
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

  // Follow-up cadence — best-effort. If the script chokes (no tracker yet,
  // missing Node), the page renders without the urgent-followups section.
  let followupsUrgent: { job: Job; entry: FollowupEntry }[] = [];
  let followupsOverdue: { job: Job; entry: FollowupEntry }[] = [];
  let followupsCadenceMeta: Awaited<ReturnType<typeof getFollowupCadence>>['metadata'] | null = null;
  try {
    const cadence = await getFollowupCadence();
    followupsCadenceMeta = cadence.metadata;
    const activeJobs = jobs.filter((j) => ['Applied', 'Screened', 'Interview', 'Offer'].includes(j.status));
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
    // Silent — Inbox stays usable even if cadence parsing fails
  }

  return {
    firstName,
    nowISO: new Date().toISOString(),
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
    recentErrorsCount,
    pipelineDaysAgo,
    alerts,
    followupsUrgent,
    followupsOverdue,
    followupsCadenceMeta,
    runtime: {
      hasAnthropic: !!env.ANTHROPIC_API_KEY,
      hasGemini: !!env.GEMINI_API_KEY,
      runningTasks: running,
    },
  };
}
