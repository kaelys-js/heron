import {
  readSafe, listReports, PIPELINE, APPLICATIONS, GEMINI_SCORES, REPORTS_DIR
} from './files';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Job, Status, BgRisk } from '$lib/types';
import { STATUS_ORDER } from '$lib/types';

export function urlId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

export function parsePipeline(): Job[] {
  const text = readSafe(PIPELINE);
  const out: Job[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const m = /^- \[[ x!]\] (https?:\/\/\S+?)\s*\|\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?$/.exec(line.trim());
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

export function parseApplications(): Record<string, Partial<Job>> {
  const text = readSafe(APPLICATIONS);
  const out: Record<string, Partial<Job>> = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 9) continue;
    const [, , , company, role, scoreStr, status, pdf, report, notes] = cells;
    const url = (line.match(/https?:\/\/\S+/) || [''])[0];
    if (!url) continue;
    const id = urlId(url);
    const score = parseFloat(scoreStr);
    out[id] = {
      score: isNaN(score) ? undefined : score,
      status: mapStatus(status),
      pdfFile: pdf && pdf !== '—' && !pdf.includes('regen') ? pdf : undefined,
      reportFile: report && report !== '—' ? path.basename(report) : undefined,
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

export function indexReports(): Record<string, { file: string; score?: number; bgRisk?: BgRisk }> {
  const out: Record<string, { file: string; score?: number; bgRisk?: BgRisk }> = {};
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
    out[id] = { file, score, bgRisk: bg };
  }
  return out;
}

export function loadAllJobs(): Job[] {
  const pipeline = parsePipeline();
  const gemini = parseGeminiScores();
  const apps = parseApplications();
  const reports = indexReports();
  for (const job of pipeline) {
    const g = gemini[job.id];
    const a = apps[job.id];
    const r = reports[job.id];
    if (g) job.geminiScore = g.score;
    if (r) {
      if (r.score !== undefined) job.score = r.score;
      if (r.bgRisk) job.bgRisk = r.bgRisk;
      job.reportFile = r.file;
    }
    if (g && job.status === 'New') job.status = 'Scored';
    if (a) Object.assign(job, a);
  }
  return pipeline;
}

export function groupByStatus(jobs: Job[]): Record<Status, Job[]> {
  const grouped = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: [] }), {} as Record<Status, Job[]>);
  for (const j of jobs) {
    (grouped[j.status] ||= []).push(j);
  }
  for (const s of STATUS_ORDER) {
    grouped[s].sort((a, b) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1));
  }
  return grouped;
}
