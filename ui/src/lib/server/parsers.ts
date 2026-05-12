import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readSafe, ROOT } from './files';
import type { Job, Status, BgRisk, WorkMode } from '$lib/types';
import { STATUS_ORDER } from '$lib/types';
import { profilePath } from './profile-paths';
import { getActiveProfileId, listProfiles } from './profiles';

/**
 * Per-profile pipeline + applications + scoring + reports parser.
 *
 * Every export accepts an optional `profileId` first argument. The special
 * sentinel `'all'` returns a UNION across every profile, with each job
 * tagged with its `profileId` so the cross-profile "all profiles" inbox
 * view can render a profile badge per row.
 */

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

function listReportsFor(profileId: string): string[] {
  const dir = profilePath(profileId, 'reports-dir');
  try {
    return fs
      .readdirSync(dir)
      .filter((f: string) => f.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Build a URL → source map from THIS profile's scan-history.tsv. Every
 * scanner writes a row when it discovers a new URL with the `portal`
 * column = source identifier (e.g. `workday-api`, `aijobs`).
 *
 * Returns an empty map if the file doesn't exist or fails to parse —
 * never throws.
 */
function loadSourceMap(profileId: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readSafe(profilePath(profileId, 'scan-history'));
    if (!text) return out;
    const lines = text.split('\n');
    // Header: url\tfirst_seen\tportal\ttitle\tcompany\tstatus
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 3) continue;
      const url = parts[0];
      const portal = parts[2];
      if (!url || !portal) continue;
      if (!(url in out)) out[url] = portal;
    }
  } catch {
    /* tolerate */
  }
  return out;
}

export function urlId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

export function parsePipeline(profileId?: string): Job[] {
  const id = resolveId(profileId);
  const text = readSafe(profilePath(id, 'pipeline'));
  const out: Job[] = [];
  const seen = new Set<string>();
  let idx = 0;

  for (const line of text.split('\n')) {
    const m = /^- \[[ x!]\] (https?:\/\/\S+?)\s*\|\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?$/.exec(
      line.trim(),
    );
    if (!m) continue;
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: urlId(url),
      url,
      company: m[2].trim(),
      role: m[3].trim(),
      location: (m[4] ?? '').trim(),
      status: 'New',
      pipelineIndex: idx++,
    });
  }
  return out;
}

export function parseGeminiScores(
  profileId?: string,
): Record<string, { score: number; reason: string }> {
  const id = resolveId(profileId);
  const text = readSafe(profilePath(id, 'gemini-scores'));
  if (!text) return {};
  const out: Record<string, { score: number; reason: string }> = {};
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length < 7) continue;
    const url = parts[2];
    const score = parseFloat(parts[1]);
    const reason = parts[6];
    if (!isNaN(score)) out[urlId(url)] = { score, reason };
  }
  return out;
}

export function parseApplications(
  reportFileToUrlId: Record<string, string> = {},
  profileId?: string,
): Record<string, Partial<Job>> {
  const id = resolveId(profileId);
  const text = readSafe(profilePath(id, 'applications'));
  const out: Record<string, Partial<Job>> = {};

  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cells = line.split('|').map((c) => c.trim());

    let scoreStr: string, status: string, pdf: string, report: string, notes: string;
    if (cells.length >= 12) {
      [, , , , , , scoreStr, status, pdf, report, notes] = cells;
    } else if (cells.length >= 11) {
      [, , , , , scoreStr, status, pdf, report, notes] = cells;
    } else {
      continue;
    }

    let jobIdStr: string | undefined;
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (urlMatch) {
      jobIdStr = urlId(urlMatch[0]);
    } else if (report) {
      const reportFile = path.basename((report.match(/\(([^)]+)\)/) || ['', report])[1]);
      jobIdStr = reportFileToUrlId[reportFile];
    }
    if (!jobIdStr) continue;

    const score = parseFloat(scoreStr);
    out[jobIdStr] = {
      score: isNaN(score) ? undefined : score,
      status: mapStatus(status),
      // Preserve the states.yml canonical value separately so the UI can
      // render a secondary chip (e.g. "Discarded" vs "Skip" both fold to
      // pipeline "Closed" but mean different things to the user).
      applicationStatus: extractApplicationStatus(status),
      pdfFile: pdf && pdf !== '—' && !pdf.includes('regen') ? pdf : undefined,
      reportFile:
        report && report !== '—'
          ? path.basename((report.match(/\(([^)]+)\)/) || ['', report])[1])
          : undefined,
      notes,
    };
  }
  return out;
}

/**
 * Map an applications.md status cell to the dashboard's pipeline `Status`.
 *
 * Handles three vocabularies in priority order:
 *   1. Dashboard's own pipeline labels (Ready / Applied / Screened / ...)
 *   2. states.yml canonical IDs (evaluated, applied, responded, ...)
 *   3. Legacy Spanish aliases from when the project shipped bilingual modes
 *
 * See `docs/STATUS_MODEL.md` for why the pipeline `Status` is orthogonal to
 * `ApplicationStatus` — this function does the "fold" for display purposes;
 * the orthogonal value is preserved separately via `extractApplicationStatus`.
 */
function mapStatus(s: string): Status {
  const up = s.toUpperCase().trim();
  const lower = s.toLowerCase().trim();

  // Autonomous-apply states (Phase 0.3 of autonomous-apply plan).
  // These come from the apply-queue drain writing back to applications.md.
  if (lower === 'queued') return 'Queued';
  if (lower === 'applying' || up.includes('APPLYING')) return 'Applying';
  if (
    lower === 'manualapplyneeded' ||
    lower === 'manual-apply-needed' ||
    lower === 'manual apply needed' ||
    up.includes('MANUALAPPLYNEEDED')
  )
    return 'ManualApplyNeeded';

  // Pipeline-stage substring matches (legacy heuristic).
  if (up.includes('READY')) return 'Ready';

  // Interview sub-stages — checked BEFORE the generic 'screen'/'interview'
  // catch-alls so "Phone Screen" → PhoneScreen and "Tech Interview" →
  // Technical instead of getting flattened to the legacy bucket.
  if (
    lower === 'phonescreen' ||
    lower.includes('phone screen') ||
    lower.includes('phone-screen') ||
    lower === 'phone' ||
    lower.includes('hr screen') ||
    lower.includes('recruiter screen')
  )
    return 'PhoneScreen';
  if (
    lower === 'technical' ||
    lower.includes('tech screen') ||
    lower.includes('tech interview') ||
    lower.includes('technical interview') ||
    lower.includes('coding interview') ||
    lower === 'tech'
  )
    return 'Technical';
  if (
    lower === 'takehome' ||
    lower.includes('take-home') ||
    lower.includes('take home') ||
    lower.includes('coding test') ||
    lower.includes('coding challenge')
  )
    return 'TakeHome';
  if (
    lower === 'onsite' ||
    lower.includes('on-site') ||
    lower.includes('on site') ||
    lower.includes('virtual onsite') ||
    lower === 'panel' ||
    lower === 'super day' ||
    lower === 'loop'
  )
    return 'Onsite';
  if (
    lower === 'final' ||
    lower.includes('final round') ||
    lower === 'exec' ||
    lower === 'vp' ||
    lower.includes('hiring committee') ||
    lower.includes('hiring manager final') ||
    lower === 'leadership'
  )
    return 'Final';

  if (up.includes('SCREEN')) return 'Screened';
  if (up.includes('INTERVIEW') || lower === 'entrevista') return 'Interview';
  if (up.includes('OFFER') || lower === 'oferta') return 'Offer';
  if (up.includes('REJECT') || lower === 'rechazado' || lower === 'rechazada') return 'Rejected';
  if (up.includes('APPLIED') || ['aplicado', 'enviada', 'aplicada', 'sent'].includes(lower))
    return 'Applied';

  // states.yml canonical + Spanish aliases mapped onto pipeline.
  if (lower === 'responded' || lower === 'respondido') return 'Screened';
  if (lower === 'discarded' || ['descartado', 'descartada', 'cerrada', 'cancelada'].includes(lower))
    return 'Closed';
  if (
    up.includes('CLOSE') ||
    up.includes('SKIP') ||
    lower === 'no aplicar' ||
    lower === 'no_aplicar' ||
    lower === 'monitor' ||
    lower === 'geo blocker'
  )
    return 'Closed';
  if (
    lower === 'evaluated' ||
    ['evaluada', 'condicional', 'hold', 'evaluar', 'verificar'].includes(lower)
  )
    return 'Scored';

  return 'Scored';
}

/**
 * Extract the canonical states.yml `ApplicationStatus` from the same cell.
 * Returns undefined when the row is in pipeline-stage vocabulary (e.g.
 * "Ready" / "Screened") that has no states.yml equivalent — the dashboard
 * just won't render a secondary chip in that case.
 */
function extractApplicationStatus(s: string): import('$lib/types').ApplicationStatus | undefined {
  const lower = s.toLowerCase().replace(/\*\*/g, '').trim();
  // Direct match against canonical ids.
  if (lower === 'evaluated') return 'evaluated';
  if (lower === 'applied') return 'applied';
  if (lower === 'responded') return 'responded';
  if (lower === 'interview') return 'interview';
  if (lower === 'offer') return 'offer';
  if (lower === 'rejected') return 'rejected';
  if (lower === 'discarded') return 'discarded';
  if (lower === 'skip') return 'skip';
  // Spanish + legacy aliases (mirror verify-pipeline.mjs:ALIASES).
  if (['evaluada', 'condicional', 'hold', 'evaluar', 'verificar'].includes(lower))
    return 'evaluated';
  if (['aplicado', 'enviada', 'aplicada', 'sent'].includes(lower)) return 'applied';
  if (lower === 'respondido') return 'responded';
  if (lower === 'entrevista') return 'interview';
  if (lower === 'oferta') return 'offer';
  if (['rechazado', 'rechazada'].includes(lower)) return 'rejected';
  if (['descartado', 'descartada', 'cerrada', 'cancelada'].includes(lower)) return 'discarded';
  if (['no aplicar', 'no_aplicar', 'monitor', 'geo blocker'].includes(lower)) return 'skip';
  return undefined;
}

function classifyWorkMode(raw: string): WorkMode {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b/.test(s)) return 'onsite';
  if (/\bhybrid\b|\d+\s*day(?:s)?\s*\/?\s*(?:per\s+)?week|\bhq\s*\d/.test(s)) return 'hybrid';
  if (/\bfully\s*remote\b|\bremote[\s-]?(first|friendly|ok)\b|\bdistributed\b|\banywhere\b/.test(s))
    return 'remote';
  if (/^yes\b|^remote\b/.test(s)) return 'remote';
  if (/\bno\b|\bmust be (in|located|based) (in)?\s/.test(s)) return 'onsite';
  if (/\b(based in|located in)\s+[A-Z]/.test(raw)) return 'hybrid';
  return 'unknown';
}

export function indexReports(
  profileId?: string,
): Record<
  string,
  { file: string; score?: number; bgRisk?: BgRisk; workMode?: WorkMode; salary?: string }
> {
  const id = resolveId(profileId);
  const reportsDir = profilePath(id, 'reports-dir');
  const out: Record<
    string,
    { file: string; score?: number; bgRisk?: BgRisk; workMode?: WorkMode; salary?: string }
  > = {};

  for (const file of listReportsFor(id)) {
    const text = readSafe(path.join(reportsDir, file));
    const urlMatch = /\*\*URL:\*\*\s*(https?:\/\/\S+)/.exec(text);
    if (!urlMatch) continue;
    const jobIdStr = urlId(urlMatch[1]);
    const scoreMatch = /\*\*Score:\*\*\s*([0-9.]+)/.exec(text);
    const bgMatch = /\*\*Background Check Risk:\*\*\s*(LOW|MEDIUM|HIGH|HARD STOP|BLOCKED)/.exec(
      text,
    );
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : undefined;
    let bg: BgRisk = undefined;
    if (bgMatch) {
      const v = bgMatch[1];
      bg = v === 'HARD STOP' ? 'BLOCKED' : (v as BgRisk);
    }

    const remoteRow = /\|\s*\*\*Remote\*\*\s*\|\s*(.+?)\s*\|/i.exec(text);
    const workModeRaw = remoteRow ? remoteRow[1] : '';
    const workMode = classifyWorkMode(workModeRaw);
    const salaryRow =
      /\|\s*\*\*Sala(?:ry|rio)\*\*\s*\|\s*(.+?)\s*\|/i.exec(text) ??
      /\|\s*Salary\s*\|\s*(.+?)\s*\|/i.exec(text);
    const salary = salaryRow ? salaryRow[1].trim() : '';

    out[jobIdStr] = {
      file,
      score,
      bgRisk: bg,
      workMode: workMode === 'unknown' ? undefined : workMode,
      salary: salary || undefined,
    };
  }
  return out;
}

/**
 * Load + join every job for the given profile. When profileId === 'all',
 * returns the UNION across every registered profile, with each Job tagged
 * with its source profileId. The 'all' case dedupes jobs that share a URL
 * across profiles by KEEPING ALL OF THEM — they're legitimately different
 * candidate-rows since each profile may have different status / score for
 * the same posting.
 */
export function loadAllJobs(profileId?: string): Job[] {
  if (profileId === 'all') {
    const out: Job[] = [];
    for (const p of listProfiles()) {
      const jobs = loadJobsForProfile(p.id);
      for (const j of jobs) {
        j.profileId = p.id;
        // De-collide ids across profiles so id-keyed maps in the UI work.
        // Without this, jobs A.url and B.url where urlId(A.url)===urlId(B.url)
        // would collide. Suffix with profileId.
        j.id = j.id + ':' + p.id;
      }
      out.push(...jobs);
    }
    return out;
  }
  const id = resolveId(profileId);
  const jobs = loadJobsForProfile(id);
  // Stamp profileId on every job for single-profile callers too — Phase 6+
  // UI uses this to decide whether to render a profile chip on each row.
  for (const j of jobs) j.profileId = id;
  return jobs;
}

function loadJobsForProfile(id: string): Job[] {
  const pipeline = parsePipeline(id);
  const gemini = parseGeminiScores(id);
  const reports = indexReports(id);
  const reportFileToUrlId: Record<string, string> = {};
  for (const [jobIdStr, r] of Object.entries(reports)) reportFileToUrlId[r.file] = jobIdStr;
  const apps = parseApplications(reportFileToUrlId, id);
  const sourceByUrl = loadSourceMap(id);

  for (const job of pipeline) {
    const g = gemini[job.id];
    const a = apps[job.id];
    const r = reports[job.id];

    if (g) job.geminiScore = g.score;
    if (r) {
      if (r.score !== undefined) job.score = r.score;
      if (r.bgRisk) job.bgRisk = r.bgRisk;
      if (r.workMode) job.workMode = r.workMode;
      if (r.salary) job.salary = r.salary;
      job.reportFile = r.file;
    }
    if (g && job.status === 'New') job.status = 'Scored';
    if (a) Object.assign(job, a);
    const src = sourceByUrl[job.url];
    if (src) job.source = src;
  }
  return pipeline;
}

export function groupByStatus(jobs: Job[]): Record<Status, Job[]> {
  const grouped = STATUS_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: [] }),
    {} as Record<Status, Job[]>,
  );
  for (const j of jobs) (grouped[j.status] ||= []).push(j);
  for (const s of STATUS_ORDER) {
    grouped[s].sort((a, b) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1));
  }
  return grouped;
}

// Suppress unused-import error for ROOT (kept in case future helpers need it).
void ROOT;
