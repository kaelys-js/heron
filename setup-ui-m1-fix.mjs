/**
 * Module description.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const UI = path.join(import.meta.dirname, 'ui');

const files = {
  // Pure types — safe for both client and server
  "src/lib/types.ts": `export type Status =
  | 'New' | 'Scoring' | 'Scored' | 'Ready'
  | 'Applied' | 'Screened' | 'Interview'
  | 'Offer' | 'Rejected' | 'Closed';

export type BgRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' | undefined;

export type Job = {
  id: string;
  url: string;
  company: string;
  role: string;
  location: string;
  score?: number;
  geminiScore?: number;
  status: Status;
  bgRisk?: BgRisk;
  reportFile?: string;
  pdfFile?: string;
  notes?: string;
};

export const STATUS_ORDER: Status[] = [
  'New', 'Scoring', 'Scored', 'Ready',
  'Applied', 'Screened', 'Interview',
  'Offer', 'Rejected', 'Closed',
];
`,

  // Server-only filesystem reader (SvelteKit excludes .server.ts from client bundle)
  "src/lib/server/files.ts": `import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const PIPELINE = path.join(ROOT, 'data', 'pipeline.md');
export const APPLICATIONS = path.join(ROOT, 'data', 'applications.md');
export const GEMINI_SCORES = path.join(ROOT, 'data', 'gemini-scores.tsv');
export const REPORTS_DIR = path.join(ROOT, 'reports');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const PROFILE_YML = path.join(ROOT, 'config', 'profile.yml');

export function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

export function listReports(): string[] {
  try { return fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.md')).sort(); }
  catch { return []; }
}

export function readReport(filename: string): string {
  return readSafe(path.join(REPORTS_DIR, filename));
}

export function listPdfs(): string[] {
  try { return fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.pdf')); }
  catch { return []; }
}
`,

  // Server-only parsers
  "src/lib/server/parsers.ts": `import {
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
  for (const line of text.split('\\n')) {
    const m = /^- \\[[ x!]\\] (https?:\\/\\/\\S+?)\\s*\\|\\s*(.*?)\\s*\\|\\s*(.*?)(?:\\s*\\|\\s*(.*?))?$/.exec(line.trim());
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
  const lines = text.split('\\n');
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\\t');
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
  for (const line of text.split('\\n')) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 9) continue;
    const [, , , company, role, scoreStr, status, pdf, report, notes] = cells;
    const url = (line.match(/https?:\\/\\/\\S+/) || [''])[0];
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
    const urlMatch = /\\*\\*URL:\\*\\*\\s*(https?:\\/\\/\\S+)/.exec(text);
    if (!urlMatch) continue;
    const id = urlId(urlMatch[1]);
    const scoreMatch = /\\*\\*Score:\\*\\*\\s*([0-9.]+)/.exec(text);
    const bgMatch = /\\*\\*Background Check Risk:\\*\\*\\s*(LOW|MEDIUM|HIGH|HARD STOP|BLOCKED)/.exec(text);
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
`,

  // Update +page.server.ts to import from new location
  "src/routes/+page.server.ts": `import { loadAllJobs, groupByStatus } from '$lib/server/parsers';

export async function load() {
  const jobs = loadAllJobs();
  const grouped = groupByStatus(jobs);
  return { jobs, grouped, total: jobs.length };
}
`,

  "src/routes/job/[id]/+page.server.ts": `import { loadAllJobs } from '$lib/server/parsers';
import { readReport } from '$lib/server/files';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const jobs = loadAllJobs();
  const job = jobs.find((j) => j.id === params.id);
  if (!job) throw error(404, 'Job not found');
  const report = job.reportFile ? readReport(job.reportFile) : '';
  return { job, report };
}
`,
};

let written = 0;

for (const [rel, content] of Object.entries(files)) {
  const full = path.join(UI, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written++;
  console.log("wrote " + rel);
}
// Remove old files
for (const oldRel of ["src/lib/files.ts", "src/lib/parsers.ts"]) {
  const p = path.join(UI, oldRel);
  
if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log("removed " + oldRel);
  }
}
console.log("\n" + written + " files written.");
