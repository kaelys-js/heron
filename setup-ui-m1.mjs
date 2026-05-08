/**
 * Module description.
 *
 * @module
 */

// setup-ui-m1.mjs - creates all UI files for Milestone 1. Idempotent.

import fs from 'node:fs';
import path from 'node:path';

const UI = path.join(import.meta.dirname, 'ui');

const files = {
  // ---------- Tailwind config ----------
  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d10',
        panel: '#15151b',
        line: '#23232c',
        ink: '#e5e7eb',
        sub: '#9ca3af',
        accent: '#f97316',
        ok: '#10b981',
        warn: '#f59e0b',
        bad: '#ef4444',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
`,

  // ---------- App-level CSS ----------
  'src/app.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
body { @apply bg-bg text-ink font-sans antialiased; }
* { box-sizing: border-box; }

.score-badge { @apply px-1.5 py-0.5 rounded text-xs font-mono font-semibold; }
.score-bad { @apply bg-bad/20 text-bad; }
.score-warn { @apply bg-warn/20 text-warn; }
.score-ok { @apply bg-ok/20 text-ok; }
.score-na { @apply bg-line text-sub; }

.bg-low { @apply bg-ok/10 text-ok border-ok/30; }
.bg-medium { @apply bg-warn/10 text-warn border-warn/30; }
.bg-high { @apply bg-bad/10 text-bad border-bad/30; }
.bg-blocked { @apply bg-bad/30 text-bad border-bad/60; }

.col { @apply min-w-[280px] w-[280px] flex-shrink-0 bg-panel/40 rounded border border-line h-full flex flex-col; }
.col-head { @apply px-3 py-2 text-xs font-medium text-sub uppercase tracking-wide flex items-center gap-2 border-b border-line; }
.col-body { @apply flex-1 overflow-y-auto p-2 space-y-2; }
.card { @apply bg-panel rounded border border-line p-3 cursor-pointer hover:border-accent/50 hover:bg-panel/80 transition-colors; }
.card-title { @apply text-sm font-medium text-ink leading-tight; }
.card-meta { @apply text-xs text-sub mt-1; }
`,

  // ---------- App HTML ----------
  'src/app.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>career-ops</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`,

  // ---------- App TypeScript declaration ----------
  'src/app.d.ts': `// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {}
}
export {};
`,

  // ---------- lib/files.ts: filesystem reader ----------
  'src/lib/files.ts': `import fs from 'node:fs';
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

  // ---------- lib/parsers.ts: parse pipeline.md / applications.md / scores.tsv ----------
  'src/lib/parsers.ts': `import { readSafe, listReports, PIPELINE, APPLICATIONS, GEMINI_SCORES, REPORTS_DIR } from './files';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export type Status =
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

const STATUS_ORDER: Status[] = [
  'New', 'Scoring', 'Scored', 'Ready',
  'Applied', 'Screened', 'Interview',
  'Offer', 'Rejected', 'Closed',
];

export function urlId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

// pipeline.md format: \`- [ ] URL | Company | Role | Location\`
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

// gemini-scores.tsv: id\\tscore\\turl\\tcompany\\trole\\tlocation\\treason
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

// applications.md format:
// | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
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

// reports/<id>-<slug>-<date>.md
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
  // Sort within each column by score desc
  for (const s of STATUS_ORDER) {
    grouped[s].sort((a, b) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1));
  }
  return grouped;
}

export { STATUS_ORDER };
`,

  // ---------- Components ----------
  'src/lib/components/StatusBadge.svelte': `<script lang="ts">
  export let bgRisk: string | undefined = undefined;
</script>

{#if bgRisk}
  <span class="text-[10px] px-1 py-0.5 rounded font-mono uppercase border bg-{bgRisk?.toLowerCase()}">
    {bgRisk}
  </span>
{/if}
`,

  'src/lib/components/JobCard.svelte': `<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import type { Job } from '$lib/parsers';

  export let job: Job;

  $: displayScore = job.score ?? job.geminiScore;
  $: scoreClass = displayScore == null
    ? 'score-na'
    : displayScore >= 4.0 ? 'score-ok'
    : displayScore >= 3.0 ? 'score-warn'
    : 'score-bad';
</script>

<a href={\`/job/\${job.id}\`} class="card block">
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <div class="card-title truncate">{job.role}</div>
      <div class="card-meta truncate">{job.company}{job.location ? ' · ' + job.location : ''}</div>
    </div>
    {#if displayScore != null}
      <span class={\`score-badge \${scoreClass}\`}>{displayScore.toFixed(1)}</span>
    {/if}
  </div>
  <div class="flex items-center gap-1 mt-2">
    <StatusBadge bgRisk={job.bgRisk} />
    {#if job.reportFile}
      <span class="text-[10px] text-sub">📄 report</span>
    {/if}
    {#if job.pdfFile}
      <span class="text-[10px] text-sub">📎 PDF</span>
    {/if}
  </div>
</a>
`,

  'src/lib/components/StatusColumn.svelte': `<script lang="ts">
  import JobCard from './JobCard.svelte';
  import type { Job } from '$lib/parsers';

  export let title: string;
  export let jobs: Job[] = [];
</script>

<div class="col">
  <div class="col-head">
    <span class="text-ink font-semibold">{title}</span>
    <span class="text-sub">{jobs.length}</span>
  </div>
  <div class="col-body">
    {#each jobs as job (job.id)}
      <JobCard {job} />
    {/each}
    {#if jobs.length === 0}
      <div class="text-xs text-sub italic px-1 py-2">empty</div>
    {/if}
  </div>
</div>
`,

  // ---------- Layout ----------
  'src/routes/+layout.svelte': `<script lang="ts">
  import '../app.css';
</script>

<div class="h-screen flex flex-col bg-bg text-ink overflow-hidden">
  <header class="px-4 py-3 border-b border-line flex items-center gap-4 flex-shrink-0">
    <a href="/" class="text-base font-semibold tracking-tight">
      career-ops
      <span class="text-sub font-normal text-sm">— pipeline</span>
    </a>
    <nav class="ml-auto flex items-center gap-3 text-sm">
      <a href="/" class="text-sub hover:text-ink">Board</a>
      <a href="/stats" class="text-sub hover:text-ink">Stats</a>
      <a href="/settings" class="text-sub hover:text-ink">Settings</a>
    </nav>
  </header>
  <main class="flex-1 overflow-hidden">
    <slot />
  </main>
</div>
`,

  // ---------- Board page (root) ----------
  'src/routes/+page.svelte': `<script lang="ts">
  import StatusColumn from '$lib/components/StatusColumn.svelte';
  import { STATUS_ORDER } from '$lib/parsers';

  export let data;
</script>

<div class="h-full flex gap-3 p-3 overflow-x-auto">
  {#each STATUS_ORDER as status}
    <StatusColumn title={status} jobs={data.grouped[status] ?? []} />
  {/each}
</div>
`,

  'src/routes/+page.server.ts': `import { loadAllJobs, groupByStatus } from '$lib/parsers';

export async function load() {
  const jobs = loadAllJobs();
  const grouped = groupByStatus(jobs);
  return { jobs, grouped, total: jobs.length };
}
`,

  // ---------- Job detail ----------
  'src/routes/job/[id]/+page.svelte': `<script lang="ts">
  import { marked } from 'marked';
  export let data;
  $: html = data.report ? marked.parse(data.report) : '';
</script>

<div class="h-full overflow-y-auto p-6">
  <a href="/" class="text-sub text-sm hover:text-ink">← back to board</a>
  {#if data.job}
    <h1 class="text-2xl font-semibold mt-2">{data.job.company} — {data.job.role}</h1>
    <div class="text-sub text-sm mt-1">
      {data.job.location || '—'} ·
      <a class="hover:text-accent" href={data.job.url} target="_blank" rel="noopener">open posting ↗</a>
    </div>
    <div class="flex gap-3 mt-4 text-sm">
      {#if data.job.score != null}
        <span class="score-badge {data.job.score >= 4 ? 'score-ok' : data.job.score >= 3 ? 'score-warn' : 'score-bad'}">
          score {data.job.score.toFixed(1)}
        </span>
      {/if}
      {#if data.job.bgRisk}
        <span class="text-xs px-2 py-1 rounded border bg-{data.job.bgRisk.toLowerCase()}">BG {data.job.bgRisk}</span>
      {/if}
      <span class="text-xs px-2 py-1 rounded border border-line text-sub">status: {data.job.status}</span>
    </div>

    <hr class="border-line my-6" />

    {#if data.report}
      <article class="prose prose-invert max-w-none prose-headings:text-ink prose-a:text-accent prose-strong:text-ink prose-th:text-ink prose-td:text-sub">
        {@html html}
      </article>
    {:else}
      <div class="text-sub italic">No deep evaluation report yet for this job. Run /career-ops oferta {data.job.url} in Claude Code.</div>
    {/if}
  {:else}
    <div class="text-sub mt-4">Job not found.</div>
  {/if}
</div>
`,

  'src/routes/job/[id]/+page.server.ts': `import { loadAllJobs } from '$lib/parsers';
import { readReport } from '$lib/files';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const jobs = loadAllJobs();
  const job = jobs.find((j) => j.id === params.id);
  if (!job) throw error(404, 'Job not found');
  const report = job.reportFile ? readReport(job.reportFile) : '';
  return { job, report };
}
`,

  // ---------- Stats placeholder ----------
  'src/routes/stats/+page.svelte': `<div class="p-6 text-sub italic">Stats coming in M4.</div>
`,

  // ---------- Settings placeholder ----------
  'src/routes/settings/+page.svelte': `<div class="p-6 text-sub italic">Settings coming in M4.</div>
`,
};

// ---------- Write all files ----------
let written = 0;

for (const [rel, content] of Object.entries(files)) {
  const full = path.join(UI, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written++;
  console.log(`wrote ${rel} (${content.length} bytes)`);
}
console.log(`\n${written} files written.`);
