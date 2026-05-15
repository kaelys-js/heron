#!/usr/bin/env node
/**
 * narrative-arc.mjs — career-story coherence checker.
 *
 * A great CV tells a coherent story across roles. Recruiters and human
 * reviewers consciously and unconsciously check:
 *
 *   • Gap years that aren't explained (sabbatical / parental / health)
 *   • Sub-9-month stints (job-hopper signal)
 *   • Title regression (Senior → Junior at a new company)
 *   • Industry pivots without a thread (FinTech → HealthTech → Adtech
 *     with no narrative)
 *   • Tenure thinness (every role under 18 months — looks like
 *     someone the candidate can't hold a job)
 *   • Flat progression (10 years, all "Software Engineer", no scope
 *     growth)
 *
 * This script parses cv.md, extracts Role + Company + Date-range +
 * Title for each entry, and surfaces red flags. It does NOT auto-fix —
 * it tells the user what a human reviewer would notice so they can
 * address it in the summary / cover letter explicitly.
 *
 * Usage:
 *   pnpm narrative:check <cv.md>
 *   pnpm narrative:check <cv.md> --json
 *
 * Exit codes:
 *   0 — score ≥ 80 (clean career narrative)
 *   1 — score 50-79 (address findings in summary or cover letter)
 *   2 — score < 50 (significant narrative work needed before applying)
 *   3 — env / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const inputPath = args.find((a) => !a.startsWith('-'));

if (!inputPath) {
  console.error('Usage: node narrative-arc.mjs <cv.md> [--json]');
  process.exit(3);
}
if (!existsSync(inputPath)) {
  console.error('File not found: ' + inputPath);
  process.exit(3);
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const N = '\x1b[0m';

const md = readFileSync(inputPath, 'utf8');

// ── Parse roles from cv.md ────────────────────────────────────────────
// We accept several shapes commonly seen in markdown CVs:
//   ### Senior Engineer · Acme · 2020-2024
//   ### Senior Engineer @ Acme — 2020-Present
//   ## Lead Designer | Beta Co · Apr 2018 – Mar 2020
//
// The regex below extracts: title, company, startYear, startMonth (opt),
// endYear (or 'Present'), endMonth (opt). Sub-headings + lists below the
// header are ignored — we only need the role line.

const MONTH_MAP = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseDate(s) {
  if (!s) return null;
  const lower = s.toLowerCase().trim();
  if (lower === 'present' || lower === 'now' || lower === 'current') {
    return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  }
  // "Apr 2020" / "2020" / "April 2020"
  const mm = lower.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})$/);
  if (mm) return { year: parseInt(mm[2], 10), month: MONTH_MAP[mm[1]] };
  const ym = lower.match(/^(\d{4})$/);
  if (ym) return { year: parseInt(ym[1], 10), month: 6 }; // mid-year if year-only
  return null;
}

function monthsBetween(a, b) {
  if (!a || !b) return 0;
  return (b.year - a.year) * 12 + (b.month - a.month);
}

// Pull headings that contain a 4-digit year — these are role rows.
const lines = md.split('\n');
const roles = [];
for (const line of lines) {
  // Heading must include at least one 4-digit year.
  if (!/\d{4}/.test(line)) continue;
  // Strip leading #'s, list markers, etc.
  const stripped = line
    .replace(/^#+\s*/, '')
    .replace(/^[-*]\s*/, '')
    .trim();
  // Common separators: · (·) | – —  · @
  const parts = stripped
    .split(/[·|—–]|\s—\s|\s\|\s|\s@\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) continue;
  // Find the part that contains the date range.
  let dateRange = null;
  let title = '';
  let company = '';
  for (let i = 0; i < parts.length; i++) {
    if (/\d{4}/.test(parts[i])) {
      dateRange = parts[i];
      title = parts[0];
      company = parts.slice(1, i).join(' · ') || parts[i + 1] || '';
      break;
    }
  }
  if (!dateRange) continue;
  // Date range: "2020-2024", "Jan 2020 – Mar 2024", "2020 - Present"
  const m = dateRange.match(
    /([a-z]+\s+\d{4}|\d{4})\s*[-–—to ]+\s*([a-z]+\s+\d{4}|\d{4}|present|now|current)/i,
  );
  if (!m) continue;
  const start = parseDate(m[1]);
  const end = parseDate(m[2]);
  if (!start || !end) continue;
  roles.push({
    title: title.replace(/^#+\s*/, ''),
    company,
    start,
    end,
    tenureMonths: monthsBetween(start, end),
    period: m[1] + ' – ' + m[2],
  });
}

// Sort by start date ascending so we walk the career.
roles.sort((a, b) => a.start.year - b.start.year || a.start.month - b.start.month);

// ── Findings ──────────────────────────────────────────────────────────
const findings = [];

// 1. Gap years — any gap >6 months between end of role N and start of N+1
for (let i = 1; i < roles.length; i++) {
  const prev = roles[i - 1];
  const cur = roles[i];
  const gapMonths = monthsBetween(prev.end, cur.start);
  if (gapMonths > 6) {
    findings.push({
      kind: 'gap-year',
      severity: gapMonths > 12 ? 'warn' : 'info',
      detail:
        gapMonths +
        ' month gap between ' +
        prev.company +
        ' (ending ' +
        prev.end.year +
        ') and ' +
        cur.company +
        ' (starting ' +
        cur.start.year +
        '). Explain in summary if not already accounted for.',
      period: prev.end.year + '–' + cur.start.year,
    });
  }
}

// 2. Short stints (<9 months) — flag each
for (const r of roles) {
  if (r.tenureMonths > 0 && r.tenureMonths < 9) {
    findings.push({
      kind: 'short-stint',
      severity: 'warn',
      detail:
        r.title +
        ' @ ' +
        r.company +
        ' (' +
        r.tenureMonths +
        'mo). Sub-9-month roles read as "didn\'t work out" — proactively explain if reason was layoff / restructure.',
      period: r.period,
    });
  }
}

// 3. Tenure thinness — if MORE than half of roles are <18mo, flag
const shortRoles = roles.filter((r) => r.tenureMonths > 0 && r.tenureMonths < 18).length;
if (roles.length >= 3 && shortRoles / roles.length > 0.5) {
  findings.push({
    kind: 'tenure-thin',
    severity: 'error',
    detail:
      shortRoles +
      '/' +
      roles.length +
      ' roles under 18 months. Pattern reads as job-hopper to recruiters — lead with the strongest tenured role + a narrative reason for the moves.',
  });
}

// 4. Level regression — Senior → Junior, Lead → Associate, etc.
const LEVELS = {
  intern: 0,
  junior: 1,
  associate: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
  lead: 4,
  manager: 4,
  director: 5,
  head: 6,
  vp: 7,
  cto: 8,
  ceo: 8,
};
function levelOf(title) {
  const lower = title.toLowerCase();
  for (const [key, val] of Object.entries(LEVELS).sort((a, b) => b[0].length - a[0].length)) {
    if (lower.includes(key)) return val;
  }
  return 2; // default "mid" if no signal
}
for (let i = 1; i < roles.length; i++) {
  const prev = levelOf(roles[i - 1].title);
  const cur = levelOf(roles[i].title);
  if (cur < prev - 1) {
    findings.push({
      kind: 'level-regression',
      severity: 'warn',
      detail:
        'Title went from "' +
        roles[i - 1].title +
        '" to "' +
        roles[i].title +
        '". Recruiters notice. Was it (a) move to a much harder company, (b) industry pivot, (c) intentional IC-from-management step? Frame it in the summary.',
      period: roles[i].period,
    });
  }
}

// 5. No progression — last 3+ roles same level
if (roles.length >= 3) {
  const last3 = roles.slice(-3);
  const levels = last3.map((r) => levelOf(r.title));
  if (new Set(levels).size === 1 && roles.length >= 4) {
    findings.push({
      kind: 'no-progression',
      severity: 'info',
      detail:
        'Last 3 roles at the same level ("' +
        last3[last3.length - 1].title +
        "\"). If you're intentionally an IC, great — lead with depth + impact. If you're aiming for the next level, make the trajectory visible in the summary.",
    });
  }
}

// 6. Industry pivots — count distinct industry tokens; warn if >2 with no obvious thread
const INDUSTRY_TOKENS = [
  'fintech',
  'banking',
  'crypto',
  'insurance',
  'health',
  'medical',
  'pharma',
  'biotech',
  'edtech',
  'education',
  'adtech',
  'marketing',
  'media',
  'gaming',
  'games',
  'ecom',
  'ecommerce',
  'retail',
  'logistics',
  'travel',
  'hospitality',
  'automotive',
  'energy',
  'climate',
  'sustainability',
  'saas',
  'b2b',
  'consumer',
  'agency',
  'consulting',
];
function industryOf(role) {
  const blob = (role.company + ' ' + role.title).toLowerCase();
  const hits = [];
  for (const t of INDUSTRY_TOKENS) if (blob.includes(t)) hits.push(t);
  return hits;
}
const industriesPerRole = roles.map(industryOf);
const allIndustries = new Set(industriesPerRole.flat());
if (allIndustries.size >= 3) {
  findings.push({
    kind: 'industry-pivot',
    severity: 'info',
    detail:
      'CV touches ' +
      allIndustries.size +
      ' distinct industries (' +
      [...allIndustries].join(', ') +
      '). Hiring managers want to see the thread: same problem set, different domains? Make it explicit in summary.',
  });
}

if (findings.length === 0) {
  findings.push({
    kind: 'ok',
    severity: 'info',
    detail: 'Career narrative reads cleanly — no obvious red flags for a recruiter scan.',
  });
}

// ── Score ─────────────────────────────────────────────────────────────
let penalty = 0;
for (const f of findings) {
  if (f.severity === 'error') penalty += 25;
  else if (f.severity === 'warn') penalty += 10;
  else if (f.severity === 'info' && f.kind !== 'ok') penalty += 4;
}
const score = Math.max(0, 100 - penalty);

if (jsonOutput) {
  console.log(JSON.stringify({ score, findings, rolesParsed: roles.length }, null, 2));
  process.exit(score >= 80 ? 0 : score >= 50 ? 1 : 2);
}

console.log();
console.log(`${B}Narrative Arc Report${N}  ${DIM}${resolve(inputPath)}${N}`);
console.log(`${DIM}${roles.length} roles parsed${N}`);
console.log();
if (findings.every((f) => f.kind === 'ok')) {
  console.log(`  ${G}✓${N} ` + findings[0].detail);
} else {
  for (const f of findings) {
    const tag =
      f.severity === 'error' ? `${R}✗${N}` : f.severity === 'warn' ? `${Y}↑${N}` : `${DIM}·${N}`;
    console.log(`  ${tag} ${B}${f.kind}${N}  ${f.detail}`);
  }
}
console.log();
const color = score >= 80 ? G : score >= 50 ? Y : R;
console.log(`${B}Narrative Score${N}  ${color}${score}/100${N}`);
process.exit(score >= 80 ? 0 : score >= 50 ? 1 : 2);
