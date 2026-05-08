import { readSafe, listReports, PIPELINE, APPLICATIONS, GEMINI_SCORES, REPORTS_DIR, ROOT } from './files';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Job, Status, BgRisk, WorkMode } from '$lib/types';
import { STATUS_ORDER } from '$lib/types';

/**
 * Build a URL → source map from data/scan-history.tsv. Every scanner
 * writes a row when it discovers a new URL with the `portal` column =
 * source identifier (e.g. `workday-api`, `aijobs`). This map lets the
 * pipeline page render a "where did this come from" chip per row.
 *
 * Returns an empty map if the file doesn't exist (first-run case) or
 * fails to parse — never throws.
 */
function loadSourceMap(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readSafe(path.join(ROOT, 'data', 'scan-history.tsv'));
    if (!text) return out;
    const lines = text.split('\n');
    // Header: url\tfirst_seen\tportal\ttitle\tcompany\tstatus
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 3) continue;
      const url = parts[0];
      const portal = parts[2];
      if (!url || !portal) continue;
      // First-seen wins — earliest source attribution sticks even if a
      // later scanner re-encountered the same URL.
      if (!(url in out)) out[url] = portal;
    }
  } catch { /* tolerate */ }
  return out;
}

export function urlId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

export function parsePipeline(): Job[] {
  const text = readSafe(PIPELINE);
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

export function parseGeminiScores(): Record<string, { score: number; reason: string }> {
  const text = readSafe(GEMINI_SCORES);
  
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
): Record<string, Partial<Job>> {
  const text = readSafe(APPLICATIONS);
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

    let id: string | undefined;
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (urlMatch) {
      id = urlId(urlMatch[0]);
    } else if (report) {
      const reportFile = path.basename((report.match(/\(([^)]+)\)/) || ['', report])[1]);
      id = reportFileToUrlId[reportFile];
    }
    if (!id) continue;

    const score = parseFloat(scoreStr);
    out[id] = {
      score: isNaN(score) ? undefined : score,
      status: mapStatus(status),
      pdfFile: pdf && pdf !== '—' && !pdf.includes('regen') ? pdf : undefined,
      reportFile: report && report !== '—' ? path.basename((report.match(/\(([^)]+)\)/) || ['', report])[1]) : undefined,
      notes,
    };
  }
  return out;
}

function mapStatus(s: string): Status {
  const up = s.toUpperCase();
  
if (up.includes('READY')) return 'Ready';
  if (up.includes('APPLIED')) return 'Applied';
  if (up.includes('SCREEN')) return 'Screened';
  if (up.includes('INTERVIEW')) return 'Interview';
  if (up.includes('OFFER')) return 'Offer';
  if (up.includes('REJECT')) return 'Rejected';
  if (up.includes('CLOSE') || up.includes('SKIP')) return 'Closed';
  return 'Scored';
}

function classifyWorkMode(raw: string): WorkMode {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b/.test(s)) return 'onsite';
  if (/\bhybrid\b|\d+\s*day(?:s)?\s*\/?\s*(?:per\s+)?week|\bhq\s*\d/.test(s)) return 'hybrid';
  if (/\bfully\s*remote\b|\bremote[\s-]?(first|friendly|ok)\b|\bdistributed\b|\banywhere\b/.test(s)) return 'remote';
  if (/^yes\b|^remote\b/.test(s)) return 'remote';
  if (/\bno\b|\bmust be (in|located|based) (in)?\s/.test(s)) return 'onsite';
  if (/\b(based in|located in)\s+[A-Z]/.test(raw)) return 'hybrid';
  return 'unknown';
}

export function indexReports(): Record<string, { file: string; score?: number; bgRisk?: BgRisk; workMode?: WorkMode; salary?: string }> {
  const out: Record<string, { file: string; score?: number; bgRisk?: BgRisk; workMode?: WorkMode; salary?: string }> = {};

  for (const file of listReports()) {
    const text = readSafe(path.join(REPORTS_DIR, file));
    const urlMatch = /\*\*URL:\*\*\s*(https?:\/\/\S+)/.exec(text);
    if (!urlMatch) continue;
    const id = urlId(urlMatch[1]);
    const scoreMatch = /\*\*Score:\*\*\s*([0-9.]+)/.exec(text);
    const bgMatch = /\*\*Background Check Risk:\*\*\s*(LOW|MEDIUM|HIGH|HARD STOP|BLOCKED)/.exec(text);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : undefined;
    let bg: BgRisk = undefined;
    if (bgMatch) {
      const v = bgMatch[1];
      bg = v === 'HARD STOP' ? 'BLOCKED' : (v as BgRisk);
    }

    // Cheap row-level extraction for the cards (full parser lives in lib/server/report-summary.ts)
    const remoteRow = /\|\s*\*\*Remote\*\*\s*\|\s*(.+?)\s*\|/i.exec(text);
    const workModeRaw = remoteRow ? remoteRow[1] : '';
    const workMode = classifyWorkMode(workModeRaw);
    const salaryRow =
      /\|\s*\*\*Sala(?:ry|rio)\*\*\s*\|\s*(.+?)\s*\|/i.exec(text) ??
      /\|\s*Salary\s*\|\s*(.+?)\s*\|/i.exec(text);
    const salary = salaryRow ? salaryRow[1].trim() : '';

    out[id] = {
      file,
      score,
      bgRisk: bg,
      workMode: workMode === 'unknown' ? undefined : workMode,
      salary: salary || undefined,
    };
  }
  return out;
}

export function loadAllJobs(): Job[] {
  const pipeline = parsePipeline();
  const gemini = parseGeminiScores();
  const reports = indexReports();
  const reportFileToUrlId: Record<string, string> = {};
  for (const [id, r] of Object.entries(reports)) reportFileToUrlId[r.file] = id;
  const apps = parseApplications(reportFileToUrlId);
  const sourceByUrl = loadSourceMap();

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
    // Source: looked up by URL — kept on the Job object so every list
    // view + filter doesn't have to re-parse scan-history.tsv.
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
