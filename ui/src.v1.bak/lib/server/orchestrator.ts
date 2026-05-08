import { spawn, type ChildProcess } from 'node:child_process';
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
    logEvent('orchestrator', `task already running: ${name}`, 'warn');
    return;
  }
  logEvent('orchestrator', `starting: ${name} (${cmd} ${args.join(' ')})`);
  const p = spawn(cmd, args, { cwd, env: { ...process.env } });
  running.set(name, p);
  let stdoutBuf = '';
  p.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let i;
    while ((i = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, i);
      stdoutBuf = stdoutBuf.slice(i + 1);
      if (line.trim()) logEvent(name, line.trim());
    }
  });
  p.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent(name, line, 'warn');
  });
  p.on('close', (code) => {
    running.delete(name);
    logEvent('orchestrator', `task ${name} exited code ${code}`, code === 0 ? 'success' : 'error');
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
  logEvent('orchestrator', `starting LinkedIn Easy Apply (autoSubmit=${autoSubmit})`);
  const p = spawn(venvPython(), ['linkedin-easy-apply.py'], { cwd: ROOT, env });
  running.set('apply-linkedin', p);
  p.stdout.on('data', (c) => {
    const lines = c.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line);
  });
  p.stderr.on('data', (c) => {
    const lines = c.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line, 'warn');
  });
  p.on('close', (code) => {
    running.delete('apply-linkedin');
    logEvent('orchestrator', `apply-linkedin exited code ${code}`, code === 0 ? 'success' : 'error');
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
