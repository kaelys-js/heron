/**
 * Module description.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const UI = path.join(import.meta.dirname, 'ui');

const files = {
  // ----- Event bus (in-memory) -----
  "src/lib/server/events.ts": `import { EventEmitter } from 'node:events';

export type ActivityEvent = {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  msg: string;
};

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
  // also stdout for the dev terminal
  console.log(\`[\${source}] \${msg}\`);
}
`,

  // ----- Orchestrator: spawn child processes, stream output to bus -----
  "src/lib/server/orchestrator.ts": `import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, GEMINI_SCORES, PIPELINE } from './files';
import { logEvent } from './events';

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
  const onLine = (line: string) => {
    if (line.trim()) logEvent(name, line.trim());
  };
  let stdoutBuf = '';
  p.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let i;
    while ((i = stdoutBuf.indexOf('\\n')) >= 0) {
      const line = stdoutBuf.slice(0, i);
      stdoutBuf = stdoutBuf.slice(i + 1);
      onLine(line);
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

// Auto-trigger logic on server start
let bootRan = false;
export function bootOnce() {
  if (bootRan) return;
  bootRan = true;

  const pipelineExists = fs.existsSync(PIPELINE);
  const geminiExists = fs.existsSync(GEMINI_SCORES);

  logEvent('boot', 'orchestrator initializing');

  // 1. If pipeline.md missing or empty -> run scan
  if (!pipelineExists || fs.statSync(PIPELINE).size < 200) {
    logEvent('boot', 'pipeline.md missing or empty -> running scan-broad');
    runScan();
    return;
  }

  // 2. If pipeline has rows but gemini-scores missing AND we have an API key -> run gemini
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

  // ----- Server hooks: boot orchestrator on server start -----
  "src/hooks.server.ts": `import { bootOnce } from '$lib/server/orchestrator';

// Run once on server startup
bootOnce();

export const handle = async ({ event, resolve }) => resolve(event);
`,

  // ----- API: SSE activity stream -----
  "src/routes/api/stream/+server.ts": `import { bus } from '$lib/server/events';

export const GET = async ({ request }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (ev: any) => {
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(ev)}\\n\\n\`));
      };

      // Send recent buffered events first
      for (const ev of bus.recent()) send(ev);

      const handler = (ev: any) => send(ev);
      bus.on('event', handler);

      // Heartbeat every 25s
      const beat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\\n\\n')); }
        catch { clearInterval(beat); }
      }, 25000);

      request.signal.addEventListener('abort', () => {
        bus.off('event', handler);
        clearInterval(beat);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
`,

  // ----- API: trigger orchestrator tasks -----
  "src/routes/api/run/+server.ts": `import { json } from '@sveltejs/kit';
import { runScan, runGemini, runLinkedInApply, runLinkedInLogin, listRunning } from '$lib/server/orchestrator';

export const GET = async () => json({ running: listRunning() });

export const POST = async ({ request }) => {
  const { task, autoSubmit } = await request.json();
  switch (task) {
    case 'scan': runScan(); break;
    case 'gemini': runGemini(); break;
    case 'apply-linkedin': runLinkedInApply(!!autoSubmit); break;
    case 'apply-linkedin-login': runLinkedInLogin(); break;
    default: return json({ error: 'unknown task' }, { status: 400 });
  }
  return json({ ok: true, running: listRunning() });
};
`,

  // ----- API: update job status -----
  "src/routes/api/status/+server.ts": `import { json, error } from '@sveltejs/kit';
import { APPLICATIONS } from '$lib/server/files';
import fs from 'node:fs';

export const POST = async ({ request }) => {
  const { url, newStatus, notes } = await request.json();
  if (!url || !newStatus) throw error(400, 'url + newStatus required');

  let text = '';
  try { text = fs.readFileSync(APPLICATIONS, 'utf8'); }
  catch { text = '# Applications Tracker\\n\\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\\n|---|------|---------|------|-------|--------|-----|--------|-------|\\n'; }

  const lines = text.split('\\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      if (cells.length > 6) {
        cells[6] = ' ' + newStatus + ' ';
        if (notes && cells.length > 9) cells[9] = ' ' + notes + ' ';
        lines[i] = cells.join('|');
        updated = true;
      }
      break;
    }
  }

  if (!updated) {
    // append a new row
    const today = new Date().toISOString().slice(0, 10);
    lines.push(\`| - | \${today} | - | - | - | \${newStatus} | - | - | \${notes ?? ''} | \`);
    lines[lines.length - 1] = \`| - | \${today} | (manual) | \${url} | - | \${newStatus} | - | - | \${notes ?? ''} |\`;
  }

  fs.writeFileSync(APPLICATIONS, lines.join('\\n'));
  return json({ ok: true });
};
`,

  // ----- Layout: add activity rail + SSE client -----
  "src/routes/+layout.svelte": `<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  type Ev = { ts: number; level: string; source: string; msg: string };
  let events = $state<Ev[]>([]);
  let railOpen = $state(true);
  let connectionStatus = $state<'connecting' | 'open' | 'error'>('connecting');

  onMount(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => (connectionStatus = 'open');
    es.onerror = () => (connectionStatus = 'error');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        events = [ev, ...events].slice(0, 200);
      } catch {}
    };
    return () => es.close();
  });

  function lvl(l: string) {
    return l === 'error' ? 'text-bad'
      : l === 'warn' ? 'text-warn'
      : l === 'success' ? 'text-ok'
      : 'text-sub';
  }
  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString();
  }

  async function trigger(task: string) {
    await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task }) });
  }
</script>

<div class="h-screen flex flex-col bg-bg text-ink overflow-hidden">
  <header class="px-4 py-3 border-b border-line flex items-center gap-4 flex-shrink-0">
    <a href="/" class="text-base font-semibold tracking-tight">
      career-ops
      <span class="text-sub font-normal text-sm">— pipeline</span>
    </a>
    <nav class="ml-auto flex items-center gap-3 text-sm">
      <button onclick={() => trigger('scan')} class="text-sub hover:text-ink">Run Scan</button>
      <button onclick={() => trigger('gemini')} class="text-sub hover:text-ink">Run Gemini</button>
      <button onclick={() => trigger('apply-linkedin')} class="text-sub hover:text-ink">LinkedIn Apply</button>
      <a href="/" class="text-sub hover:text-ink">Board</a>
      <a href="/stats" class="text-sub hover:text-ink">Stats</a>
      <a href="/settings" class="text-sub hover:text-ink">Settings</a>
      <button onclick={() => (railOpen = !railOpen)} class="text-sub hover:text-ink">
        {railOpen ? '⟩' : '⟨'} Activity ({events.length})
      </button>
    </nav>
  </header>
  <div class="flex-1 flex overflow-hidden">
    <main class="flex-1 overflow-hidden">
      {@render children?.()}
    </main>
    {#if railOpen}
      <aside class="w-80 flex-shrink-0 bg-panel/40 border-l border-line flex flex-col overflow-hidden">
        <div class="px-3 py-2 text-xs font-medium text-sub uppercase tracking-wide flex items-center gap-2 border-b border-line">
          <span class="text-ink font-semibold">Activity</span>
          <span class="ml-auto text-{connectionStatus === 'open' ? 'ok' : connectionStatus === 'error' ? 'bad' : 'sub'}">
            ● {connectionStatus}
          </span>
        </div>
        <div class="flex-1 overflow-y-auto text-xs font-mono p-2 space-y-1">
          {#each events as ev (ev.ts + ev.msg)}
            <div class="flex gap-2 leading-tight">
              <span class="text-sub w-16 flex-shrink-0">{fmtTime(ev.ts)}</span>
              <span class="text-accent w-20 flex-shrink-0 truncate">{ev.source}</span>
              <span class={lvl(ev.level) + ' break-words flex-1 min-w-0'}>{ev.msg}</span>
            </div>
          {/each}
          {#if events.length === 0}
            <div class="text-sub italic px-1 py-2">no events yet</div>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>
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
console.log("\nM2: " + written + " files written.");
