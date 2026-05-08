import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, GEMINI_SCORES, PIPELINE } from './files';
import { logEvent } from './events';
import { loadEnv } from './env';
import { CLI_NAMESPACE } from '$lib/config/branding';

loadEnv();

type TaskName = 'scan' | 'gemini' | 'oferta' | 'pdf' | 'apply-linkedin' | 'bulk-cv' | 'bulk-apply';
const running = new Map<TaskName, ChildProcess>();

function venvPython(): string {
  const p = path.join(ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(p)) return p;
  return 'python3';
}

export function isRunning(name: TaskName): boolean { return running.has(name); }
export function listRunning(): string[] { return [...running.keys()]; }

/**
 * Spawn a long-running task and stream its stdout/stderr lines into the
 * activity feed via logEvent. Every transition (start, line, finish, fail,
 * spawn-error) emits a structured event so the user can always reconstruct
 * what happened from the bell + activity feed alone.
 */
function start(name: TaskName, cmd: string, args: string[], cwd = ROOT) {
  if (running.has(name)) {
    logEvent(name, 'Task already running', {
      level: 'warn',
      category: 'task',
      message: 'Wait for the running ' + name + ' to finish before starting another one.',
    });
    return;
  }
  logEvent(name, 'Task started', {
    category: 'task',
    message: cmd + ' ' + args.join(' ') + ' · cwd=' + cwd,
  });
  let p: ChildProcess;
  try {
    p = spawn(cmd, args, { cwd, env: { ...process.env } });
  } catch (e) {
    // Synchronous spawn() rarely throws (most failures emit 'error'), but
    // EACCES on the binary can come back here.
    logEvent(name, 'Task failed to spawn', {
      level: 'error',
      category: 'task',
      message: cmd + ': ' + (e instanceof Error ? e.message : String(e)),
    });
    return;
  }
  running.set(name, p);
  let stdoutBuf = '';
  p.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    let i;
    while ((i = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, i);
      stdoutBuf = stdoutBuf.slice(i + 1);
      if (line.trim()) logEvent(name, line.trim(), { category: 'task' });
    }
  });
  p.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent(name, line, { level: 'warn', category: 'task' });
  });
  // Critical: without this listener, a spawn failure (ENOENT — binary missing)
  // emits an unhandled error and crashes the dev server.
  p.on('error', (err: Error) => {
    running.delete(name);
    const isMissingBinary = (err as NodeJS.ErrnoException).code === 'ENOENT';
    logEvent(name, 'Task failed to spawn', {
      level: 'error',
      category: 'task',
      message: isMissingBinary
        ? cmd + ': command not found. Install Python (.venv) or check PATH.'
        : err.message,
    });
  });
  p.on('close', (code: number | null) => {
    running.delete(name);
    if (code === 0) {
      logEvent(name, 'Task finished', { level: 'success', category: 'task', message: 'Exit code 0 · ' + name });
    } else if (code === null) {
      // null = killed by signal (e.g. user reload during dev) — don't surface as error
      logEvent(name, 'Task interrupted', {
        level: 'warn',
        category: 'task',
        message: 'Process killed before completion (signal)',
      });
    } else {
      logEvent(name, 'Task failed', {
        level: 'error',
        category: 'task',
        message: 'Exit code ' + code + ' · check logs above for the failing line',
      });
    }
  });
}

export function runScan() { start('scan', venvPython(), ['scan-broad.py']); }

export function runGemini(top = 30) {
  if (!process.env.GEMINI_API_KEY) {
    logEvent('gemini', 'Gemini API key not set', {
      level: 'error',
      category: 'task',
      message: 'Add it in Settings to enable first-pass scoring.',
      link: '/settings',
    });
    return;
  }
  start('gemini', venvPython(), ['gemini-first-pass.py', '--top', String(top)]);
}

export function runLinkedInLogin() { start('apply-linkedin', venvPython(), ['linkedin-easy-apply.py', '--login']); }

export function runLinkedInApply(autoSubmit = false, url?: string) {
  if (running.has('apply-linkedin')) {
    logEvent('apply-linkedin', 'LinkedIn apply already running', {
      level: 'warn',
      category: 'task',
      message: 'Wait for the current run to finish — concurrent LinkedIn sessions get flagged.',
    });
    return;
  }
  const env = { ...process.env };
  if (autoSubmit) env.LINKEDIN_AUTO_SUBMIT = '1';
  logEvent('apply-linkedin', 'LinkedIn Easy Apply started', {
    category: 'task',
    message: url ? 'single URL: ' + url : 'queue mode · autoSubmit=' + autoSubmit,
  });
  const args = ['linkedin-easy-apply.py'];
  if (url) args.push('--url', url);
  let p: ChildProcess;
  try {
    p = spawn(venvPython(), args, { cwd: ROOT, env });
  } catch (e) {
    logEvent('apply-linkedin', 'LinkedIn apply failed to spawn', {
      level: 'error',
      category: 'task',
      message: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  running.set('apply-linkedin', p);
  p.stdout?.on('data', (c: Buffer) => {
    const lines = c.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line, { category: 'task' });
  });
  p.stderr?.on('data', (c: Buffer) => {
    const lines = c.toString().split('\n').filter(Boolean);
    for (const line of lines) logEvent('apply-linkedin', line, { level: 'warn', category: 'task' });
  });
  p.on('error', (err: Error) => {
    running.delete('apply-linkedin');
    const isMissingBinary = (err as NodeJS.ErrnoException).code === 'ENOENT';
    logEvent('apply-linkedin', 'LinkedIn apply failed to spawn', {
      level: 'error',
      category: 'task',
      message: isMissingBinary
        ? 'Python not found. Run `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` first.'
        : err.message,
    });
  });
  p.on('close', (code: number | null) => {
    running.delete('apply-linkedin');
    if (code === 0) {
      logEvent('apply-linkedin', 'LinkedIn apply finished', {
        level: 'success',
        category: 'task',
        message: url ? 'Applied: ' + url : 'Queue exhausted — see counts in /applied',
      });
    } else if (code === null) {
      logEvent('apply-linkedin', 'LinkedIn apply interrupted', {
        level: 'warn',
        category: 'task',
        message: 'Process killed before completion',
      });
    } else {
      logEvent('apply-linkedin', 'LinkedIn apply failed', {
        level: 'error',
        category: 'task',
        message: 'Exit code ' + code + ' — common causes: LinkedIn re-login required, rate-limit, captcha. Run "Re-login to LinkedIn" from Settings.',
      });
    }
  });
}

// =============================================================================
// Tailored CV / oferta — spawn the Claude Code CLI to run the oferta mode for
// a single URL. Claude's `/career-ops oferta <url>` produces a deep evaluation
// report AND a tailored CV PDF in one shot.
//
// We pin Claude Code (the CLI) here. Other CLIs follow the open agent skill
// standard but their headless flags and prompt formats differ; this is the
// pragmatic choice for now. If Claude isn't on PATH, the spawn fails with
// ENOENT and we surface a clean error in the activity feed.
// =============================================================================

export type OfertaResult = { ok: boolean; code: number | null };

export function runOferta(url: string, taskKey: TaskName = 'oferta'): Promise<OfertaResult> {
  return new Promise((resolve) => {
    if (running.has(taskKey)) {
      logEvent(taskKey, 'Generate CV already running', {
        level: 'warn',
        category: 'task',
        message: 'Wait for the in-flight oferta to finish before queueing another.',
      });
      resolve({ ok: false, code: null });
      return;
    }
    const prompt = '/' + CLI_NAMESPACE + ' oferta ' + url;
    logEvent(taskKey, 'Generate CV started', {
      category: 'task',
      message: 'oferta · ' + url,
    });
    let p: ChildProcess;
    try {
      p = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
        cwd: ROOT,
        env: { ...process.env },
      });
    } catch (e) {
      logEvent(taskKey, 'Failed to spawn claude CLI', {
        level: 'error',
        category: 'task',
        message: e instanceof Error ? e.message : String(e),
      });
      resolve({ ok: false, code: null });
      return;
    }
    running.set(taskKey, p);
    p.stdout?.on('data', (c: Buffer) => {
      const lines = c.toString().split('\n').filter(Boolean);
      for (const line of lines) logEvent(taskKey, line, { category: 'task' });
    });
    p.stderr?.on('data', (c: Buffer) => {
      const lines = c.toString().split('\n').filter(Boolean);
      for (const line of lines) logEvent(taskKey, line, { level: 'warn', category: 'task' });
    });
    p.on('error', (err: Error) => {
      running.delete(taskKey);
      const isMissingBinary = (err as NodeJS.ErrnoException).code === 'ENOENT';
      logEvent(taskKey, 'Failed to spawn claude CLI', {
        level: 'error',
        category: 'task',
        message: isMissingBinary
          ? '`claude` not found on PATH — install Claude Code or use a different CLI.'
          : err.message,
      });
      resolve({ ok: false, code: null });
    });
    p.on('close', (code: number | null) => {
      running.delete(taskKey);
      const ok = code === 0;
      logEvent(taskKey, ok ? 'Generate CV finished' : 'Generate CV failed', {
        level: ok ? 'success' : 'error',
        category: 'task',
        message: ok
          ? 'Report + tailored CV PDF generated · ' + url
          : 'Exit code ' + code + ' — review the spawned process output above. Common causes: rate limits, prompt errors, missing CV file.',
      });
      resolve({ ok, code });
    });
  });
}

// =============================================================================
// Bulk CV — sequentially run oferta for each URL. We don't parallelize to avoid
// Claude rate limits and to keep the activity feed readable.
// =============================================================================

export async function runBulkOferta(urls: string[]): Promise<{ ok: number; failed: number; total: number }> {
  if (running.has('bulk-cv')) {
    logEvent('bulk-cv', 'Bulk CV already running', { level: 'warn', category: 'task' });
    return { ok: 0, failed: 0, total: 0 };
  }
  // Reserve the slot synchronously — spawn() runs inside runOferta with a different key
  running.set('bulk-cv', null as any);
  logEvent('bulk-cv', 'Bulk CV started', {
    category: 'task',
    message: urls.length + ' job(s) queued',
  });
  let ok = 0;
  let failed = 0;
  try {
    for (let i = 0; i < urls.length; i++) {
      logEvent('bulk-cv', 'Bulk CV ' + (i + 1) + '/' + urls.length, {
        category: 'task',
        message: urls[i],
      });
      const r = await runOferta(urls[i], 'oferta');
      if (r.ok) ok++; else failed++;
    }
  } finally {
    running.delete('bulk-cv');
  }
  logEvent('bulk-cv', 'Bulk CV finished', {
    level: failed === 0 ? 'success' : 'warn',
    category: 'task',
    message: ok + ' generated · ' + failed + ' failed',
  });
  return { ok, failed, total: urls.length };
}

// =============================================================================
// Bulk apply — fans out across two paths:
//   * LinkedIn URLs → linkedin-easy-apply.py with --url one at a time
//   * Other URLs → mark-applied (status flip). The UI is responsible for
//     opening the postings in new tabs separately; the orchestrator only does
//     server-side state changes.
// =============================================================================

export type BulkApplyOutcome = { url: string; mode: 'linkedin' | 'mark'; ok: boolean; error?: string };

function runLinkedInApplyAwait(url: string): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    let p: ChildProcess;
    try {
      p = spawn(venvPython(), ['linkedin-easy-apply.py', '--url', url], {
        cwd: ROOT,
        env: { ...process.env },
      });
    } catch (e) {
      logEvent('apply-linkedin', 'Failed to spawn LinkedIn Easy Apply', {
        level: 'error',
        category: 'task',
        message: e instanceof Error ? e.message : String(e),
      });
      resolve({ ok: false });
      return;
    }
    running.set('apply-linkedin', p);
    p.stdout?.on('data', (c: Buffer) => {
      const lines = c.toString().split('\n').filter(Boolean);
      for (const line of lines) logEvent('apply-linkedin', line, { category: 'task' });
    });
    p.stderr?.on('data', (c: Buffer) => {
      const lines = c.toString().split('\n').filter(Boolean);
      for (const line of lines) logEvent('apply-linkedin', line, { level: 'warn', category: 'task' });
    });
    p.on('error', (err: Error) => {
      running.delete('apply-linkedin');
      const isMissingBinary = (err as NodeJS.ErrnoException).code === 'ENOENT';
      logEvent('apply-linkedin', 'Failed to spawn LinkedIn Easy Apply', {
        level: 'error',
        category: 'task',
        message: isMissingBinary
          ? 'Python or .venv missing. Set up venv first.'
          : err.message,
      });
      resolve({ ok: false });
    });
    p.on('close', (code: number | null) => {
      running.delete('apply-linkedin');
      if (code !== 0 && code !== null) {
        logEvent('apply-linkedin', 'Per-job apply exited non-zero', {
          level: 'warn',
          category: 'task',
          message: 'url=' + url + ' · exit=' + code,
        });
      }
      resolve({ ok: code === 0 });
    });
  });
}

export async function runBulkApply(jobs: { url: string; isLinkedIn: boolean }[]): Promise<BulkApplyOutcome[]> {
  if (running.has('bulk-apply')) {
    logEvent('bulk-apply', 'Bulk apply already running', { level: 'warn', category: 'task' });
    return [];
  }
  running.set('bulk-apply', null as any);
  logEvent('bulk-apply', 'Bulk apply started', {
    category: 'task',
    message: jobs.length + ' job(s) · LinkedIn auto + Open-and-mark for others',
  });
  const outcomes: BulkApplyOutcome[] = [];
  try {
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      logEvent('bulk-apply', 'Bulk apply ' + (i + 1) + '/' + jobs.length, {
        category: 'task',
        message: j.url,
      });
      if (j.isLinkedIn) {
        const r = await runLinkedInApplyAwait(j.url);
        outcomes.push({ url: j.url, mode: 'linkedin', ok: r.ok, error: r.ok ? undefined : 'LinkedIn Easy Apply exited non-zero' });
      } else {
        // The status flip itself happens in the API endpoint via markApplied(url),
        // but for orchestrator-driven bulk we still log here so the activity feed
        // tells the same story regardless of path.
        outcomes.push({ url: j.url, mode: 'mark', ok: true });
      }
    }
  } finally {
    running.delete('bulk-apply');
  }
  const okCount = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - okCount;
  logEvent('bulk-apply', 'Bulk apply finished', {
    level: failed === 0 ? 'success' : 'warn',
    category: 'task',
    message: okCount + ' applied · ' + failed + ' failed',
  });
  return outcomes;
}

let bootRan = false;
export function bootOnce() {
  if (bootRan) return;
  bootRan = true;
  loadEnv();
  // Lazy import to avoid circular dep at module init. If it fails, the user
  // loses Autopilot — we MUST log so the bell shows it instead of silently
  // pretending scheduling works.
  import('./autopilot')
    .then((m) => m.startScheduler())
    .catch((err) => {
      logEvent('boot', 'Autopilot scheduler failed to start', {
        level: 'error',
        category: 'system',
        message: err instanceof Error ? err.message : String(err),
        link: '/autopilot',
      });
    });
  const pipelineExists = fs.existsSync(PIPELINE);
  const geminiExists = fs.existsSync(GEMINI_SCORES);
  logEvent('boot', 'Server started', { category: 'system' });
  if (!pipelineExists || fs.statSync(PIPELINE).size < 200) {
    logEvent('boot', 'Pipeline empty — running auto-scan', { category: 'system', message: 'Spawning scan-broad.py' });
    runScan();
    return;
  }
  if (!geminiExists && process.env.GEMINI_API_KEY) {
    logEvent('boot', 'Auto-scoring new pipeline', { category: 'system', message: 'Spawning gemini-first-pass.py' });
    runGemini(30);
    return;
  }
  if (!process.env.GEMINI_API_KEY && !geminiExists) {
    logEvent('boot', 'Gemini API key not set', {
      level: 'warn',
      category: 'system',
      message: 'Add a key in Settings to enable first-pass scoring.',
      link: '/settings',
    });
  }
  logEvent('boot', 'Ready', { level: 'success', category: 'system', message: 'Pipeline + scores already populated' });
}
