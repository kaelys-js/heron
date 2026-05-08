/**
 * Module description.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const UI = path.join(import.meta.dirname, 'ui');

const files = {
  // ----- env helper (read/write .env in career-ops root) -----
  "src/lib/server/env.ts": `import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ROOT } from './files';

const ENV_FILE = path.join(ROOT, '.env');

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

const KEYS: (keyof EnvVars)[] = [
  'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY',
];

export function readEnv(): EnvVars {
  const out: EnvVars = {};
  for (const k of KEYS) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

// Returns redacted view (last 4 chars only) for UI
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
  const out = Object.entries(existing)
    .map(([k, v]) => \`\${k}=\${v}\`)
    .join('\\n') + '\\n';
  fs.writeFileSync(ENV_FILE, out);
}
`,

  // ----- API: settings GET/POST -----
  "src/routes/api/settings/+server.ts": `import { json } from '@sveltejs/kit';
import { readEnvMasked, writeEnv, loadEnv } from '$lib/server/env';
import { logEvent } from '$lib/server/events';

loadEnv();

export const GET = async () => json(readEnvMasked());

export const POST = async ({ request }) => {
  const updates = await request.json();
  writeEnv(updates);
  logEvent('settings', 'env vars updated');
  return json({ ok: true, current: readEnvMasked() });
};
`,

  // ----- Settings page -----
  "src/routes/settings/+page.server.ts": `import { readEnvMasked } from '$lib/server/env';

export async function load() {
  return { env: readEnvMasked() };
}
`,

  "src/routes/settings/+page.svelte": `<script lang="ts">
  let { data } = $props();
  let env = $state({ ...data.env });
  let saving = $state(false);
  let savedFlash = $state(false);

  async function save() {
    saving = true;
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env),
      });
      const j = await r.json();
      env = { ...j.current };
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 2000);
    } finally {
      saving = false;
    }
  }

  async function linkedinLogin() {
    await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'apply-linkedin-login' }),
    });
  }

  const fields = [
    { key: 'GEMINI_API_KEY', label: 'Gemini API key', help: 'Free tier at https://aistudio.google.com/apikey — required for first-pass scoring' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', help: 'Required for Interview Prep, Mock Interview, Negotiation panels' },
    { key: 'ADZUNA_APP_ID', label: 'Adzuna App ID', help: 'Optional — extra job source. Free at https://developer.adzuna.com' },
    { key: 'ADZUNA_APP_KEY', label: 'Adzuna App Key', help: 'Optional — paired with App ID' },
  ];
</script>

<div class="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-semibold mb-1">Settings</h1>
  <div class="text-sub text-sm mb-6">API keys are stored in <code class="text-accent">~/career-ops/.env</code></div>

  <div class="space-y-4">
    {#each fields as f}
      <div class="bg-panel/40 border border-line rounded p-4">
        <label class="block text-sm font-medium text-ink mb-1">{f.label}</label>
        <input
          type="text"
          bind:value={env[f.key]}
          placeholder={env[f.key] && env[f.key].startsWith('****') ? env[f.key] : 'paste new value to update'}
          class="w-full bg-bg border border-line rounded px-3 py-2 text-sm font-mono"
        />
        <div class="text-xs text-sub mt-1">{f.help}</div>
      </div>
    {/each}
  </div>

  <button onclick={save} disabled={saving} class="mt-6 px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
    {saving ? 'Saving...' : savedFlash ? '✓ Saved' : 'Save'}
  </button>

  <div class="mt-10 border-t border-line pt-6">
    <h2 class="text-lg font-semibold mb-1">LinkedIn Easy Apply</h2>
    <div class="text-sub text-sm mb-3">
      One-time setup: log in to LinkedIn so the automation has session cookies.
      A browser window opens — you log in manually, then return.
    </div>
    <button onclick={linkedinLogin} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30">
      Login to LinkedIn for Easy Apply
    </button>
  </div>

  <div class="mt-10 border-t border-line pt-6 text-sub text-sm">
    <h2 class="text-lg font-semibold text-ink mb-2">Restart Note</h2>
    <div>Some environment changes require a server restart. After saving keys, restart <code class="text-accent">pnpm go</code> to ensure they're loaded into all child processes.</div>
  </div>
</div>
`,

  // ----- Stats page -----
  "src/routes/stats/+page.server.ts": `import { loadAllJobs, groupByStatus } from '$lib/server/parsers';
import { listReports, listPdfs, OUTPUT_DIR, GEMINI_SCORES } from '$lib/server/files';
import fs from 'node:fs';

export async function load() {
  const jobs = loadAllJobs();
  const grouped = groupByStatus(jobs);

  const counts = {
    total: jobs.length,
    new: grouped.New.length,
    scored: grouped.Scored.length,
    ready: grouped.Ready.length,
    applied: grouped.Applied.length,
    screened: grouped.Screened.length,
    interview: grouped.Interview.length,
    offer: grouped.Offer.length,
    rejected: grouped.Rejected.length,
    closed: grouped.Closed.length,
  };

  const reports = listReports().length;
  const pdfs = listPdfs().length;

  // Score distribution
  const dist = { high: 0, mid: 0, low: 0, unscored: 0 };
  for (const j of jobs) {
    const s = j.score ?? j.geminiScore;
    if (s == null) dist.unscored++;
    else if (s >= 4) dist.high++;
    else if (s >= 3) dist.mid++;
    else dist.low++;
  }

  // Callback rate (ratio of post-applied to applied)
  const post = counts.screened + counts.interview + counts.offer;
  const applied = counts.applied + post + counts.rejected;
  const callbackRate = applied > 0 ? (post + counts.rejected > 0 ? Math.round((post / applied) * 100) : 0) : 0;

  return { counts, reports, pdfs, dist, callbackRate, applied };
}
`,

  "src/routes/stats/+page.svelte": `<script lang="ts">
  let { data } = $props();
</script>

<div class="h-full overflow-y-auto p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-semibold mb-6">Pipeline Stats</h1>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Total in pipeline</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.counts.total}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">A-G reports done</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.reports}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">PDFs generated</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.pdfs}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Applied</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.applied}</div>
    </div>
  </div>

  <h2 class="text-lg font-semibold mb-3">By status</h2>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-8">
    {#each Object.entries(data.counts).filter(([k]) => k !== 'total') as [k, v]}
      <div class="bg-panel/40 border border-line rounded p-3">
        <div class="text-xs text-sub capitalize">{k}</div>
        <div class="text-lg font-semibold text-ink">{v}</div>
      </div>
    {/each}
  </div>

  <h2 class="text-lg font-semibold mb-3">Score distribution</h2>
  <div class="grid grid-cols-4 gap-3 mb-8">
    <div class="bg-ok/10 border border-ok/30 rounded p-4">
      <div class="text-xs text-ok uppercase tracking-wide">≥ 4.0 (apply)</div>
      <div class="text-2xl font-semibold text-ok mt-1">{data.dist.high}</div>
    </div>
    <div class="bg-warn/10 border border-warn/30 rounded p-4">
      <div class="text-xs text-warn uppercase tracking-wide">3.0–3.9</div>
      <div class="text-2xl font-semibold text-warn mt-1">{data.dist.mid}</div>
    </div>
    <div class="bg-bad/10 border border-bad/30 rounded p-4">
      <div class="text-xs text-bad uppercase tracking-wide">&lt; 3.0 (skip)</div>
      <div class="text-2xl font-semibold text-bad mt-1">{data.dist.low}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Unscored</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.dist.unscored}</div>
    </div>
  </div>

  <div class="text-sub text-sm space-y-1 mt-8 border-t border-line pt-6">
    <div>Token spend tracking: not yet implemented (M4+).</div>
    <div>Run <code class="text-accent">npm run scan</code> + <code class="text-accent">scan-broad.py</code> daily for fresh jobs.</div>
    <div>Run <code class="text-accent">gemini-first-pass.py</code> after scans to score (free).</div>
  </div>
</div>
`,

  // ----- Update orchestrator to load .env on boot -----
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

export function isRunning(name: TaskName): boolean {
  return running.has(name);
}

export function listRunning(): string[] {
  return [...running.keys()];
}

function start(name: TaskName, cmd: string, args: string[], cwd = ROOT) {
  if (running.has(name)) {
    logEvent('orchestrator', \`task already running: \${name}\`, 'warn');
    return;
  }
  logEvent('orchestrator', \`starting: \${name} (\${cmd} \${args.join(' ')})\`);
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
    logEvent('orchestrator', \`task \${name} exited code \${code}\`, code === 0 ? 'success' : 'error');
  });
}

export function runScan() {
  start('scan', venvPython(), ['scan-broad.py']);
}

export function runGemini(top = 30) {
  if (!process.env.GEMINI_API_KEY) {
    logEvent('orchestrator', 'GEMINI_API_KEY not set; cannot run gemini-first-pass. Set it in Settings.', 'error');
    return;
  }
  start('gemini', venvPython(), ['gemini-first-pass.py', '--top', String(top)]);
}

export function runLinkedInLogin() {
  start('apply-linkedin', venvPython(), ['linkedin-easy-apply.py', '--login']);
}

export function runLinkedInApply(autoSubmit = false) {
  const env = { ...process.env };
  if (autoSubmit) env.LINKEDIN_AUTO_SUBMIT = '1';
  if (running.has('apply-linkedin')) {
    logEvent('orchestrator', 'LinkedIn apply already running', 'warn');
    return;
  }
  logEvent('orchestrator', \`starting LinkedIn Easy Apply (autoSubmit=\${autoSubmit})\`);
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
    logEvent('orchestrator', \`apply-linkedin exited code \${code}\`, code === 0 ? 'success' : 'error');
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
    logEvent('boot', 'pipeline.md missing or empty -> running scan-broad');
    runScan();
    return;
  }

  if (!geminiExists && process.env.GEMINI_API_KEY) {
    logEvent('boot', 'gemini-scores.tsv missing -> running gemini-first-pass');
    runGemini(30);
    return;
  }

  if (!process.env.GEMINI_API_KEY && !geminiExists) {
    logEvent('boot', 'GEMINI_API_KEY not set; skipping auto Gemini scoring (set it in Settings)', 'warn');
  }

  logEvent('boot', 'pipeline + scores already populated; nothing to auto-trigger');
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
console.log("\nM4: " + written + " files written.");
