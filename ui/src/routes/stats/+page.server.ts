/**
 * Stats page data: pipeline funnel, score distribution, velocity, top companies/sources.
 *
 * @module
 */

import { loadAllJobs, groupByStatus } from '$lib/server/parsers';
import { readSafe } from '$lib/server/files';
import { activePath, profilePath } from '$lib/server/profile-paths';
import { listProfiles } from '$lib/server/profiles';

function countDir(dir: string, ext: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

/** Count files across one or every profile's per-profile dir. */
function countAcross(profileId: string, kind: 'reports-dir' | 'output-dir', ext: string): number {
  if (profileId === 'all') {
    return listProfiles().reduce((sum, p) => sum + countDir(profilePath(p.id, kind), ext), 0);
  }
  return countDir(profilePath(profileId, kind), ext);
}
import { readScanHistorySummary } from '$lib/server/scan-history';
import type { Job, Status, BgRisk } from '$lib/types';
import { STATUS_ORDER } from '$lib/types';
import fs from 'node:fs';

// Source-pattern matchers. Each `match` returns true if the URL is from that source.
// Substring presence checks (CodeQL js/regex/missing-regexp-anchor: pattern 4 -- substring is intended).
const SOURCE_PATTERNS: Array<{ name: string; match: (lower: string) => boolean }> = [
  { name: 'LinkedIn', match: (u) => u.includes('linkedin.com') },
  { name: 'Indeed', match: (u) => u.includes('indeed.com') },
  { name: 'Greenhouse', match: (u) => u.includes('greenhouse.io') },
  { name: 'Ashby', match: (u) => u.includes('ashbyhq.com') || u.includes('jobs.ashbyhq') },
  { name: 'Lever', match: (u) => u.includes('lever.co') },
  { name: 'Workday', match: (u) => u.includes('myworkdayjobs') || u.includes('workday.com') },
  { name: 'SmartRecruiters', match: (u) => u.includes('smartrecruiters.com') },
  { name: 'Wellfound', match: (u) => u.includes('wellfound.com') || u.includes('angel.co') },
  {
    name: 'YC Work',
    match: (u) => u.includes('ycombinator.com') || u.includes('workatastartup.com'),
  },
  { name: 'Hacker News', match: (u) => u.includes('news.ycombinator') },
  { name: 'The Muse', match: (u) => u.includes('themuse.com') },
  { name: 'Adzuna', match: (u) => u.includes('adzuna') },
  { name: 'Google Jobs', match: (u) => u.includes('jobs.google') },
  { name: 'Glassdoor', match: (u) => u.includes('glassdoor.com') },
  { name: 'Monster', match: (u) => u.includes('monster.com') },
];

function sourceOf(url: string): string {
  const lower = url.toLowerCase();
  for (const p of SOURCE_PATTERNS) if (p.match(lower)) return p.name;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return (
      h
        .split('.')
        .slice(-2, -1)[0]
        ?.replace(/^./, (c) => c.toUpperCase()) || h
    );
  } catch {
    return 'Other';
  }
}

function parseApplicationDates(profileId: string): string[] {
  // 'all' → sum dates across every profile's applications.md
  const sources: string[] =
    profileId === 'all'
      ? listProfiles().map((p) => profilePath(p.id, 'applications'))
      : [profilePath(profileId, 'applications')];
  const dates: string[] = [];
  for (const src of sources) {
    const txt = readSafe(src);
    for (const line of txt.split('\n')) {
      if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 6) continue;
      const date = cells[2];
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
    }
  }
  return dates;
}

function velocityBuckets(dates: string[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of dates) map.set(d, (map.get(d) ?? 0) + 1);
  const out: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

export async function load({ url }: { url: URL }) {
  // /stats is CROSS-PROFILE by default -- comparing track performance is the
  // whole point. `?profile=<slug>` narrows to one profile for drill-down.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && queryProfile !== 'all' ? queryProfile : 'all';
  const jobs: Job[] = loadAllJobs(profileId);
  const grouped = groupByStatus(jobs);

  // Funnel
  const funnel = STATUS_ORDER.map((s) => ({ status: s, count: grouped[s].length }));
  // Counts by status
  const counts: Record<string, number> = { total: jobs.length };
  for (const s of STATUS_ORDER) counts[s.toLowerCase()] = grouped[s].length;

  const reports = countAcross(profileId, 'reports-dir', '.md');
  const pdfs = countAcross(profileId, 'output-dir', '.pdf');
  const appliedStatuses: Status[] = ['Applied', 'Screened', 'Interview', 'Offer', 'Rejected'];
  const applied = appliedStatuses.reduce((acc, s) => acc + grouped[s].length, 0);

  // Score distribution -- 5 buckets, applied vs unapplied
  const buckets = [
    { label: '0–1', range: [0, 1], total: 0, applied: 0 },
    { label: '1–2', range: [1, 2], total: 0, applied: 0 },
    { label: '2–3', range: [2, 3], total: 0, applied: 0 },
    { label: '3–4', range: [3, 4], total: 0, applied: 0 },
    { label: '4–5', range: [4, 5.001], total: 0, applied: 0 },
  ];
  let scoreSum = 0;
  let scoreCount = 0;
  let unscored = 0;
  for (const j of jobs) {
    const s = j.score ?? j.geminiScore;
    if (s == null) {
      unscored++;
      continue;
    }
    scoreSum += s;
    scoreCount++;
    const isApplied = appliedStatuses.includes(j.status);
    for (const b of buckets) {
      if (s >= b.range[0] && s < b.range[1]) {
        b.total++;
        if (isApplied) b.applied++;
        break;
      }
    }
  }
  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : 0;

  // Top companies
  const companyMap = new Map<string, { count: number; statuses: Record<string, number> }>();
  for (const j of jobs) {
    const key = j.company || '(unknown)';
    let entry = companyMap.get(key);
    if (!entry) {
      entry = { count: 0, statuses: {} };
      companyMap.set(key, entry);
    }
    entry.count++;
    entry.statuses[j.status] = (entry.statuses[j.status] ?? 0) + 1;
  }
  const topCompanies = [...companyMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, v]) => ({ name, count: v.count, statuses: v.statuses }));

  // Top sources
  const sourceMap = new Map<string, { count: number; applied: number }>();
  for (const j of jobs) {
    const src = sourceOf(j.url);
    let entry = sourceMap.get(src);
    if (!entry) {
      entry = { count: 0, applied: 0 };
      sourceMap.set(src, entry);
    }
    entry.count++;
    if (appliedStatuses.includes(j.status)) entry.applied++;
  }
  const topSources = [...sourceMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, v]) => ({
      name,
      count: v.count,
      applied: v.applied,
      rate: v.count > 0 ? v.applied / v.count : 0,
    }));

  // BG-risk distribution -- normalize defensively (some legacy reports may have lowercased values)
  const bgCounts: Record<NonNullable<BgRisk>, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, BLOCKED: 0 };
  let bgUnknown = 0;
  const VALID_BG = new Set(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']);
  for (const j of jobs) {
    const raw = j.bgRisk ? String(j.bgRisk).toUpperCase() : null;
    if (raw && VALID_BG.has(raw)) bgCounts[raw as NonNullable<BgRisk>]++;
    else bgUnknown++;
  }

  // Velocity (applications.md dates)
  const appDates = parseApplicationDates(profileId);
  const velocity = velocityBuckets(appDates);
  const last7 = velocity.slice(-7).reduce((a, b) => a + b.count, 0);
  const prev7 = velocity.slice(0, 7).reduce((a, b) => a + b.count, 0);
  const velocityDelta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  // Top 5 ready jobs
  const topReady = grouped.Ready.slice(0, 5).map((j) => ({
    id: j.id,
    company: j.company,
    role: j.role,
    score: j.score ?? j.geminiScore ?? null,
    bgRisk: j.bgRisk,
  }));

  // Pipeline staleness -- for 'all' mode, use the freshest mtime across
  // every profile (so a recently-scanned profile makes the overall view
  // appear fresh).
  let pipelineStaleDays: number | null = null;
  try {
    const pipelinePaths =
      profileId === 'all'
        ? listProfiles().map((p) => profilePath(p.id, 'pipeline'))
        : [profilePath(profileId, 'pipeline')];
    let mostRecent = 0;
    for (const p of pipelinePaths) {
      try {
        const stat = fs.statSync(p);
        if (stat.mtimeMs > mostRecent) mostRecent = stat.mtimeMs;
      } catch {}
    }
    if (mostRecent > 0) {
      pipelineStaleDays = Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24));
    }
  } catch {}

  // Conversion rates
  const conversion = {
    scoredOfTotal: counts.total > 0 ? (counts.total - unscored) / counts.total : 0,
    readyOfScored:
      counts.scored + counts.ready > 0
        ? counts.ready / (counts.scored + counts.ready + applied)
        : 0,
    appliedOfReady: applied + counts.ready > 0 ? applied / (applied + counts.ready) : 0,
    interviewOfApplied:
      counts.applied + counts.screened + counts.interview + counts.offer > 0
        ? (counts.interview + counts.offer) /
          (counts.applied + counts.screened + counts.interview + counts.offer + counts.rejected)
        : 0,
    overallApplied: counts.total > 0 ? applied / counts.total : 0,
  };

  // Scan-history summary -- used by the new "Scan history" card
  const scanHistory = readScanHistorySummary(profileId);

  return {
    profileId,
    counts,
    reports,
    pdfs,
    applied,
    avgScore,
    unscored,
    funnel,
    buckets,
    topCompanies,
    topSources,
    bgCounts,
    bgUnknown,
    velocity,
    last7,
    prev7,
    velocityDelta,
    topReady,
    pipelineStaleDays,
    conversion,
    scanHistory,
  };
}
