/**
 * Module description.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const UI = path.join(import.meta.dirname, 'ui');

const files = {
  // ---- src/app.html ----
  "src/app.html": `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>career-ops</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="bg-background text-foreground antialiased">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`,

  // ---- src/app.css (Tailwind v4 + shadcn zinc + dark default) ----
  "src/app.css": `@import 'tailwindcss';
@import 'tw-animate-css';

@plugin '@tailwindcss/typography';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.21 0.006 285.885);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.871 0.006 286.286);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.21 0.006 285.885);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.871 0.006 286.286);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0.006 285.95);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0.006 285.95);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.21 0.006 285.885);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.27 0.006 286.033);
  --input: oklch(0.27 0.006 286.033);
  --ring: oklch(0.442 0.017 285.786);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.16 0.006 285.95);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.24 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.24 0.006 286.033);
  --sidebar-ring: oklch(0.442 0.017 285.786);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1, 'cv11' 1;
  }
}
`,

  // ---- src/app.d.ts ----
  "src/app.d.ts": `// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {}
}
export {};
`,

  // ---- src/lib/utils.ts ----
  "src/lib/utils.ts": `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + 'd ago';
  return new Date(ts).toLocaleDateString();
}

export function truncate(s: string, n = 60): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
`,

  // ---- src/lib/types.ts ----
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

export const STATUS_TINTS: Record<Status, string> = {
  New: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
  Scoring: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Scored: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  Ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Applied: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  Screened: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Interview: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  Offer: 'bg-green-500/15 text-green-300 border-green-500/40',
  Rejected: 'bg-red-500/10 text-red-300 border-red-500/30',
  Closed: 'bg-zinc-500/5 text-zinc-500 border-zinc-500/20',
};

export const BG_TINTS: Record<NonNullable<BgRisk>, string> = {
  LOW: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  HIGH: 'bg-red-500/10 text-red-300 border-red-500/30',
  BLOCKED: 'bg-red-500/30 text-red-200 border-red-500/60',
};

export type ActivityEvent = {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  msg: string;
};
`,

  // ---- src/lib/server/files.ts ----
  "src/lib/server/files.ts": `import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(process.cwd(), '..');
export const PIPELINE = path.join(ROOT, 'data', 'pipeline.md');
export const APPLICATIONS = path.join(ROOT, 'data', 'applications.md');
export const GEMINI_SCORES = path.join(ROOT, 'data', 'gemini-scores.tsv');
export const REPORTS_DIR = path.join(ROOT, 'reports');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const PROFILE_YML = path.join(ROOT, 'config', 'profile.yml');
export const MODES_DIR = path.join(ROOT, 'modes');
export const CV_MD = path.join(ROOT, 'cv.md');
export const ENV_FILE = path.join(ROOT, '.env');

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

export function listModes(): string[] {
  try { return fs.readdirSync(MODES_DIR).filter((f) => f.endsWith('.md')); }
  catch { return []; }
}
`,

  // ---- src/lib/server/parsers.ts ----
  "src/lib/server/parsers.ts": `import { readSafe, listReports, PIPELINE, APPLICATIONS, GEMINI_SCORES, REPORTS_DIR } from './files';
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
  for (const j of jobs) (grouped[j.status] ||= []).push(j);
  for (const s of STATUS_ORDER) {
    grouped[s].sort((a, b) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1));
  }
  return grouped;
}
`,

  // ---- src/lib/server/events.ts ----
  "src/lib/server/events.ts": `import { EventEmitter } from 'node:events';
import type { ActivityEvent } from '$lib/types';

class Bus extends EventEmitter {
  private buf: ActivityEvent[] = [];
  private MAX = 500;
  emitEvent(ev: ActivityEvent) {
    this.buf.push(ev);
    if (this.buf.length > this.MAX) this.buf.shift();
    this.emit('event', ev);
  }
  recent(): ActivityEvent[] {
    return [...this.buf];
  }
}

export const bus = new Bus();

export function logEvent(source: string, msg: string, level: ActivityEvent['level'] = 'info') {
  bus.emitEvent({ ts: Date.now(), level, source, msg });
  console.log('[' + source + '] ' + msg);
}
`,

  // ---- src/lib/server/env.ts ----
  "src/lib/server/env.ts": `import fs from 'node:fs';
import dotenv from 'dotenv';
import { ENV_FILE } from './files';

export function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    dotenv.config({ path: ENV_FILE, override: false });
  }
}

export type EnvVars = {
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
};

const KEYS: (keyof EnvVars)[] = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY'];

export function readEnv(): EnvVars {
  const out: EnvVars = {};
  for (const k of KEYS) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

export function readEnvMasked(): Record<string, string> {
  const out: Record<string, string> = {};
  const e = readEnv();
  for (const k of KEYS) {
    const v = e[k];
    if (!v) out[k] = '';
    else if (v.length < 8) out[k] = '****';
    else out[k] = '****' + v.slice(-4);
  }
  return out;
}

export function writeEnv(updates: Partial<EnvVars>) {
  let existing: Record<string, string> = {};
  if (fs.existsSync(ENV_FILE)) {
    const txt = fs.readFileSync(ENV_FILE, 'utf8');
    for (const line of txt.split('\\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) existing[m[1]] = m[2];
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (v && v.trim() && !v.startsWith('****')) {
      existing[k] = v.trim();
      process.env[k] = v.trim();
    } else if (v === '') {
      delete existing[k];
      delete process.env[k];
    }
  }
  const out = Object.entries(existing).map(([k, v]) => k + '=' + v).join('\\n') + '\\n';
  fs.writeFileSync(ENV_FILE, out);
}
`,

  // ---- src/lib/server/orchestrator.ts ----
  "src/lib/server/orchestrator.ts": `import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, GEMINI_SCORES, PIPELINE } from './files';
import { logEvent } from './events';
import { loadEnv } from './env';

loadEnv();

type TaskName = 'scan' | 'gemini' | 'oferta' | 'pdf' | 'apply-linkedin';
const running = new Map<TaskName, ChildProcess>();

function venvPython(): string {
  const p = path.join(ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(p)) return p;
  return 'python3';
}

export function isRunning(name: TaskName): boolean { return running.has(name); }
export function listRunning(): string[] { return [...running.keys()]; }

function start(name: TaskName, cmd: string, args: string[], cwd = ROOT) {
  if (running.has(name)) {
    logEvent('orchestrator', 'task already running: ' + name, 'warn');
    return;
  }
  logEvent('orchestrator', 'starting: ' + name + ' (' + cmd + ' ' + args.join(' ') + ')');
  const p = spawn(cmd, args, { cwd, env: { ...process.env } });
  running.set(name, p);
  let stdoutBuf = '';
  p.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let i;
    while ((i = stdoutBuf.indexOf('\\n')) >= 0) {
      const line = stdoutBuf.slice(0, i);
      stdoutBuf = stdoutBuf.slice(i + 1);
      if (line.trim()) logEvent(name, line.trim());
    }
  });
  p.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\\n').filter(Boolean);
    for (const line of lines) logEvent(name, line, 'warn');
  });
  p.on('close', (code) => {
    running.delete(name);
    logEvent('orchestrator', 'task ' + name + ' exited code ' + code, code === 0 ? 'success' : 'error');
  });
}

export function runScan() { start('scan', venvPython(), ['scan-broad.py']); }

export function runGemini(top = 30) {
  if (!process.env.GEMINI_API_KEY) {
    logEvent('orchestrator', 'GEMINI_API_KEY not set; cannot run gemini-first-pass.', 'error');
    return;
  }
  start('gemini', venvPython(), ['gemini-first-pass.py', '--top', String(top)]);
}

export function runLinkedInLogin() { start('apply-linkedin', venvPython(), ['linkedin-easy-apply.py', '--login']); }

export function runLinkedInApply(autoSubmit = false) {
  const env = { ...process.env };
  if (autoSubmit) env.LINKEDIN_AUTO_SUBMIT = '1';
  if (running.has('apply-linkedin')) {
    logEvent('orchestrator', 'LinkedIn apply already running', 'warn');
    return;
  }
  logEvent('orchestrator', 'starting LinkedIn Easy Apply (autoSubmit=' + autoSubmit + ')');
  const p = spawn(venvPython(), ['linkedin-easy-apply.py'], { cwd: ROOT, env });
  running.set('apply-linkedin', p);
  p.stdout.on('data', (c) => {
    const lines = c.toString().split('\\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line);
  });
  p.stderr.on('data', (c) => {
    const lines = c.toString().split('\\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line, 'warn');
  });
  p.on('close', (code) => {
    running.delete('apply-linkedin');
    logEvent('orchestrator', 'apply-linkedin exited code ' + code, code === 0 ? 'success' : 'error');
  });
}

let bootRan = false;
export function bootOnce() {
  if (bootRan) return;
  bootRan = true;
  loadEnv();
  const pipelineExists = fs.existsSync(PIPELINE);
  const geminiExists = fs.existsSync(GEMINI_SCORES);
  logEvent('boot', 'orchestrator initializing');
  if (!pipelineExists || fs.statSync(PIPELINE).size < 200) {
    logEvent('boot', 'pipeline.md missing -> running scan-broad');
    runScan();
    return;
  }
  if (!geminiExists && process.env.GEMINI_API_KEY) {
    logEvent('boot', 'gemini-scores.tsv missing -> running gemini-first-pass');
    runGemini(30);
    return;
  }
  if (!process.env.GEMINI_API_KEY && !geminiExists) {
    logEvent('boot', 'GEMINI_API_KEY not set; skipping auto Gemini scoring', 'warn');
  }
  logEvent('boot', 'pipeline + scores already populated; nothing to auto-trigger');
}
`,

  // ---- src/lib/server/ai.ts ----
  "src/lib/server/ai.ts": `import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function complete(systemPrompt: string, userMessage: string, opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\\n');
}

export async function chat(systemPrompt: string, history: { role: 'user' | 'assistant'; content: string }[], opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 1500,
    system: systemPrompt,
    messages: history,
  });
  return resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\\n');
}
`,

  // ---- src/lib/server/interview.ts ----
  "src/lib/server/interview.ts": `import path from 'node:path';
import { ROOT, readSafe } from './files';
import { complete } from './ai';

export function loadModeFile(name: string): string {
  return readSafe(path.join(ROOT, 'modes', name));
}

export async function generateInterviewPrep(reportFile: string, archetypeOverride?: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, 'reports', reportFile));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const interviewPrepMode = loadModeFile('interview-prep.md');
  const sys = 'You are a senior interview-prep coach. Use the report (Block A/B/F) to produce a focused brief.\\n\\n' + (interviewPrepMode || 'Generate a comprehensive interview prep brief.');
  const user = '# Report\\n' + reportContent + '\\n\\n# CV\\n' + cv.slice(0, 3000) + '\\n\\n# Task\\nProduce a Markdown brief: 8-12 likely questions, STAR map, 5-topic study plan, 3 talking points, red flags, 5 questions to ask back.' + (archetypeOverride ? '\\n\\nReframe for archetype: ' + archetypeOverride : '');
  return complete(sys, user, { maxTokens: 3500 });
}

export async function generateNegotiationBrief(reportFile: string, offerDetails: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, 'reports', reportFile));
  const profile = readSafe(path.join(ROOT, 'config', 'profile.yml'));
  const negMode = loadModeFile('negotiation.md');
  const sys = 'You are a senior compensation and negotiation coach.\\n\\n' + (negMode || '');
  const user = '# Report\\n' + reportContent + '\\n\\n# Profile\\n' + profile + '\\n\\n# Offer\\n' + offerDetails + '\\n\\nProduce: percentile table, leverage stance, draft email, 2 alternates, recruiter response handling.';
  return complete(sys, user, { maxTokens: 3000 });
}
`,

  // ---- src/hooks.server.ts ----
  "src/hooks.server.ts": `import { bootOnce } from '$lib/server/orchestrator';

bootOnce();

export const handle = async ({ event, resolve }) => resolve(event);
`,
};

let written = 0;

for (const [rel, content] of Object.entries(files)) {
  const full = path.join(UI, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written++;
  console.log('wrote ' + rel);
}
console.log('\\nfoundation: ' + written + ' files');
