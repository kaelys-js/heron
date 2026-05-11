import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './files';
import { activePath } from './profile-paths';
import { logEvent } from './events';
import { loadEnv } from './env';
import { CLI_NAMESPACE } from '$lib/config/branding';

loadEnv();

type TaskName = 'scan' | 'gemini' | 'oferta' | 'pdf' | 'apply-linkedin' | 'bulk-cv' | 'bulk-apply' | 'auto-eval';
const running = new Map<TaskName, ChildProcess>();

function venvPython(): string {
  const p = path.join(ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(p)) return p;
  return 'python3';
}

export function isRunning(name: TaskName): boolean { return running.has(name); }
export function listRunning(): string[] { return [...running.keys()]; }

// =============================================================================
// Spawn hardening — shared across every long-running task in this module.
// Adds three guards that any production-shape orchestrator needs:
//   1. A timeout — children that hang (Anthropic API stall, captcha block,
//      infinite loop) get SIGTERM'd and never sit in `running` forever
//      holding pipes & cookies.
//   2. A bounded stdoutBuf — a child that writes megabytes without `\n`
//      (e.g. a JSON dump) used to OOM the dev server's heap. Now capped
//      at 1MB; we force-flush a truncation breadcrumb and reset.
//   3. A per-spawn line-rate limiter — a runaway `print()` loop produced
//      one logEvent (and one disk write) per line. Capped at 100 lines/s
//      with a single rate-limit warning when the cap is hit.
// All wired at boot via `installChildCleanup()` which kills surviving
// children on SIGINT/SIGTERM/beforeExit so dev-server reloads don't leak.
// =============================================================================

/** Per-task default kill-after deadline. The longest-running task today is
 *  the parallel batch CV runner — 4h ceiling matches the documented user
 *  expectation. Override via `attachTimeout` if a caller knows better. */
const TIMEOUT_MS: Record<TaskName, number> = {
  scan: 30 * 60_000,           // 30 min
  gemini: 15 * 60_000,         // 15 min
  oferta: 10 * 60_000,         // 10 min — a single Claude oferta run
  pdf: 5 * 60_000,             // 5 min
  'apply-linkedin': 30 * 60_000, // 30 min — Playwright + login + apply
  'bulk-cv': 4 * 60 * 60_000,  // 4h — covers the largest realistic batch
  'bulk-apply': 2 * 60 * 60_000, // 2h
  'auto-eval': 60 * 60_000,    // 60 min — up to 10 oferta runs × 3min + headroom
};

const MAX_STDOUT_BUF = 1024 * 1024; // 1MB — see comment above
const MAX_LINES_PER_SEC = 100;

/**
 * Attach stdout + stderr line-by-line forwarders that go through `logEvent`.
 * Replaces ~5 copy-pasted blocks across this file. Bounds memory + log volume.
 */
function attachStdio(p: ChildProcess, taskName: TaskName, opts: { stderrLevel?: 'warn' | 'error' } = {}): void {
  let stdoutBuf = '';
  const stderrLevel = opts.stderrLevel ?? 'warn';
  let windowStart = Date.now();
  let lineCount = 0;
  let dropped = 0;

  const flushDropped = () => {
    if (dropped > 0) {
      logEvent(taskName, 'Output rate-limited', {
        level: 'warn',
        category: 'task',
        message: 'Dropped ' + dropped + ' lines in last second (>100/s).',
      });
      dropped = 0;
    }
  };

  const onLine = (line: string, level: 'info' | 'warn' | 'error') => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      flushDropped();
      windowStart = now;
      lineCount = 0;
    }
    lineCount++;
    if (lineCount > MAX_LINES_PER_SEC) {
      dropped++;
      return;
    }
    if (line.trim()) logEvent(taskName, line.trim(), { level, category: 'task' });
  };

  p.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    if (stdoutBuf.length > MAX_STDOUT_BUF) {
      onLine(
        stdoutBuf.slice(0, 200) + '… [truncated · no newline within ' + (MAX_STDOUT_BUF / 1024) + 'KB]',
        'warn',
      );
      stdoutBuf = '';
      return;
    }
    let i: number;
    while ((i = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, i);
      stdoutBuf = stdoutBuf.slice(i + 1);
      onLine(line, 'info');
    }
  });
  p.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) if (line) onLine(line, stderrLevel);
  });
  p.on('close', () => {
    if (stdoutBuf.trim()) onLine(stdoutBuf, 'info');
    flushDropped();
  });
}

/** SIGTERM after `ms`; SIGKILL 5s later if the child still hasn't exited. */
function attachTimeout(p: ChildProcess, taskName: TaskName, ms: number): void {
  const term = setTimeout(() => {
    if (p.exitCode !== null || p.signalCode !== null) return;
    logEvent(taskName, 'Task timed out', {
      level: 'error',
      category: 'task',
      message: 'Killing after ' + Math.round(ms / 60_000) + ' min · ' + taskName,
    });
    try { p.kill('SIGTERM'); } catch {}
    const hard = setTimeout(() => {
      if (p.exitCode !== null) return;
      try { p.kill('SIGKILL'); } catch {}
    }, 5_000);
    p.once('close', () => clearTimeout(hard));
  }, ms);
  p.once('close', () => clearTimeout(term));
  p.once('error', () => clearTimeout(term));
}

let cleanupInstalled = false;
/**
 * Idempotent. Registers process-exit handlers that SIGTERM every surviving
 * child in `running`. Without this, Vite/SvelteKit hot-reload of
 * hooks.server.ts orphans child PIDs across the dev session and leaks file
 * handles + cookies + ports.
 */
export function installChildCleanup(): void {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  const killAll = () => {
    for (const [, child] of running.entries()) {
      const c = child as ChildProcess | null;
      if (c && typeof c.kill === 'function' && c.exitCode === null) {
        try { c.kill('SIGTERM'); } catch {}
      }
    }
    running.clear();
  };
  // 'beforeExit' fires when the loop empties; dev-server reloads also fire
  // SIGTERM/SIGINT depending on host. Cover all three.
  process.once('beforeExit', killAll);
  process.once('SIGTERM', () => { killAll(); process.exit(0); });
  process.once('SIGINT', () => { killAll(); process.exit(0); });
}

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
  attachStdio(p, name);
  attachTimeout(p, name, TIMEOUT_MS[name] ?? 30 * 60_000);
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
  // Surface up-front whether the general CV is missing so the user knows the
  // upload step will be skipped (see `linkedin-easy-apply.py`'s upload site).
  // We don't fail-fast here — Easy Apply forms vary; some don't ask for a
  // resume at all, in which case running anyway is fine.
  let cvNote = '';
  try {
    // Lazy-require so the import graph doesn't grow if this codepath isn't hit.
    const { generalCvStatus } = require('./cv-pdf') as typeof import('./cv-pdf');
    const s = generalCvStatus();
    if (!s.exists) {
      cvNote = ' · WARN: no general CV (output/cv-general.pdf) — resume upload will be skipped';
    } else if (s.outdated) {
      cvNote = ' · NOTE: general CV is older than cv.md — regenerate from /profile';
    }
  } catch { /* non-fatal */ }
  logEvent('apply-linkedin', 'LinkedIn Easy Apply started', {
    category: 'task',
    message: (url ? 'single URL: ' + url : 'queue mode · autoSubmit=' + autoSubmit) + cvNote,
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
  attachStdio(p, 'apply-linkedin');
  attachTimeout(p, 'apply-linkedin', TIMEOUT_MS['apply-linkedin']);
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
    attachStdio(p, taskKey);
    attachTimeout(p, taskKey, TIMEOUT_MS[taskKey] ?? TIMEOUT_MS.oferta);
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

/**
 * Parallel bulk-CV — wraps batch/batch-runner.sh which orchestrates N
 * concurrent `claude -p` workers. Faster than the sequential `runBulkOferta`
 * but consumes more Anthropic credits in parallel; the dialog explains the
 * tradeoff. Writes batch/batch-input.tsv from the URL list, kicks off the
 * shell script, and streams output to the activity feed.
 *
 * Returns a coarse summary; per-job tracker rows are merged in by the fs
 * watcher (Phase 1.3) once batch-runner.sh writes its tracker-additions/
 * TSVs.
 */
export async function runBulkOfertaParallel(
  urls: string[],
  workers: number,
): Promise<{ started: boolean; total: number }> {
  if (running.has('bulk-cv')) {
    logEvent('bulk-cv', 'Bulk CV already running', { level: 'warn', category: 'task' });
    return { started: false, total: 0 };
  }
  if (urls.length === 0) return { started: false, total: 0 };

  // Build the batch-input.tsv from the URL list. Format expected by
  // batch-runner.sh (per `batch/batch-runner.sh` parsing):
  //   <num>\t<url>\t<company>\t<role>
  // We don't know company/role here from the URL alone — leave blank, the
  // worker prompt fills them in.
  const inputPath = path.join(ROOT, 'batch', 'batch-input.tsv');
  try {
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    const rows = urls.map((u, i) => (i + 1) + '\t' + u + '\t\t');
    fs.writeFileSync(inputPath, rows.join('\n') + '\n');
  } catch (err) {
    logEvent('bulk-cv', 'Failed to write batch-input.tsv', {
      level: 'error',
      category: 'task',
      message: err instanceof Error ? err.message : String(err),
    });
    return { started: false, total: 0 };
  }

  running.set('bulk-cv', null as any);
  const w = Math.max(1, Math.min(8, Math.floor(workers)));
  logEvent('bulk-cv', 'Bulk CV (parallel) started', {
    category: 'task',
    message: urls.length + ' jobs · ' + w + ' worker' + (w === 1 ? '' : 's'),
  });

  let p: ChildProcess;
  try {
    p = spawn('bash', ['batch/batch-runner.sh', '--parallel', String(w)], {
      cwd: ROOT,
      env: { ...process.env },
    });
  } catch (e) {
    running.delete('bulk-cv');
    logEvent('bulk-cv', 'Bulk CV failed to spawn batch-runner', {
      level: 'error',
      category: 'task',
      message: e instanceof Error ? e.message : String(e),
    });
    return { started: false, total: 0 };
  }
  attachStdio(p, 'bulk-cv');
  attachTimeout(p, 'bulk-cv', TIMEOUT_MS['bulk-cv']);
  p.on('error', (err: Error) => {
    running.delete('bulk-cv');
    logEvent('bulk-cv', 'Bulk CV (parallel) crashed', {
      level: 'error',
      category: 'task',
      message: err.message,
    });
  });
  p.on('close', (code: number | null) => {
    running.delete('bulk-cv');
    const ok = code === 0;
    logEvent('bulk-cv', ok ? 'Bulk CV (parallel) finished' : 'Bulk CV (parallel) failed', {
      level: ok ? 'success' : 'error',
      category: 'task',
      message: ok ? urls.length + ' job(s) · ' + w + ' workers' : 'exit ' + code,
    });
  });
  return { started: true, total: urls.length };
}

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
// Auto-eval — fires after Gemini scoring lands. For every job scoring ≥
// thresholds.autoEvaluateScore that doesn't already have a deep-eval report,
// queue a runOferta() call serially up to thresholds.maxAutoEvalsPerRun.
//
// Wired in via the autopilot scheduler's runTask switch + the after-trigger
// listener on 'gemini' completions. Also exposed via /api/run for power-user
// manual triggering / E2E testing.
//
// Safety rails (see plan):
//   • per-run cap from autopilot.thresholds.maxAutoEvalsPerRun
//   • 1h cooldown via the schedule's lastRunAt
//   • 3-strike abort on consecutive runOferta failures (Claude CLI broken /
//     API key revoked → bail before burning more $$)
//   • globalEnabled self-check (defensive — autopilot scheduler already
//     gates, but /api/run can call this directly)
// =============================================================================

export type AutoEvalResult = {
  ok: boolean;
  evaluated: number;
  skipped: number;
  failed: number;
  aborted?: 'already-running' | 'disabled' | 'cooldown' | 'cli-error';
};

const AUTO_EVAL_COOLDOWN_MS = 60 * 60_000; // 1h
const AUTO_EVAL_FAILURE_CIRCUIT = 3;

export async function runAutoEval(): Promise<AutoEvalResult> {
  // -------- Pre-flight gates --------
  if (running.has('auto-eval')) {
    logEvent('auto-eval', 'Auto-eval already running', {
      level: 'warn',
      category: 'task',
      message: 'Wait for the in-flight batch to finish.',
    });
    return { ok: false, evaluated: 0, skipped: 0, failed: 0, aborted: 'already-running' };
  }

  // Lazy-require to avoid the autopilot ↔ orchestrator import cycle.
  const { readConfig } = await import('./autopilot');
  const cfg = readConfig();
  if (!cfg.globalEnabled) {
    logEvent('auto-eval', 'Auto-eval skipped — autopilot disabled', {
      level: 'warn',
      category: 'task',
      message: 'Enable Autopilot on /autopilot to allow auto-eval batches.',
    });
    return { ok: false, evaluated: 0, skipped: 0, failed: 0, aborted: 'disabled' };
  }

  const schedule = cfg.schedules.find((s) => s.id === 'auto-eval-after-gemini');
  if (schedule?.lastRunAt) {
    const sinceLast = Date.now() - schedule.lastRunAt;
    if (sinceLast < AUTO_EVAL_COOLDOWN_MS) {
      const minsAgo = Math.round(sinceLast / 60_000);
      logEvent('auto-eval', 'Auto-eval skipped — cooldown active', {
        level: 'warn',
        category: 'task',
        message: 'Last run ' + minsAgo + 'm ago · 1h cooldown prevents accidental double-billing',
      });
      return { ok: false, evaluated: 0, skipped: 0, failed: 0, aborted: 'cooldown' };
    }
  }

  // -------- Build candidate list --------
  // loadAllJobs joins pipeline.md + gemini-scores.tsv + reports/. We use:
  //   geminiScore ≥ threshold  →  the bar
  //   !reportFile              →  not already deeply-evaluated
  //   status === 'Scored'      →  user hasn't manually advanced this job
  // Sorted by geminiScore desc so we burn the cap on the highest-fit ones.
  const { loadAllJobs } = await import('./parsers');
  const threshold = cfg.thresholds.autoEvaluateScore;
  const cap = cfg.thresholds.maxAutoEvalsPerRun ?? 10;
  const candidates = loadAllJobs()
    .filter((j) => j.geminiScore != null && j.geminiScore >= threshold)
    .filter((j) => !j.reportFile)
    .filter((j) => j.status === 'Scored')
    .sort((a, b) => (b.geminiScore ?? 0) - (a.geminiScore ?? 0))
    .slice(0, cap);

  if (candidates.length === 0) {
    logEvent('auto-eval', 'Auto-eval: nothing to do', {
      level: 'info',
      category: 'task',
      message: 'No Scored jobs with geminiScore ≥ ' + threshold.toFixed(1) + ' awaiting deep eval',
    });
    return { ok: true, evaluated: 0, skipped: 0, failed: 0 };
  }

  // -------- Reserve slot + start batch --------
  // We don't have a real ChildProcess for this synthetic task — slot reservation
  // is the cheap way to make isRunning('auto-eval') accurate for the scheduler.
  running.set('auto-eval', null as unknown as ChildProcess);
  logEvent('auto-eval', 'Task started', {
    category: 'task',
    message: 'Auto-eval started: ' + candidates.length + ' jobs (score ≥ ' +
      threshold.toFixed(1) + ', cap ' + cap + ')',
  });

  let evaluated = 0;
  let skipped = 0;
  let failed = 0;
  let consecutive = 0;
  let aborted: AutoEvalResult['aborted'];

  try {
    for (let i = 0; i < candidates.length; i++) {
      const job = candidates[i];

      // Re-check liveness of the candidate against the current pipeline state.
      // A manual eval / status flip mid-batch should remove the URL from our
      // queue automatically. Cheap — entirely in-memory file reads.
      const fresh = loadAllJobs().find((j) => j.url === job.url);
      if (!fresh) { skipped++; continue; }
      if (fresh.reportFile) { skipped++; continue; }
      if (fresh.status !== 'Scored') { skipped++; continue; }

      logEvent('auto-eval', 'Auto-eval ' + (i + 1) + '/' + candidates.length, {
        category: 'task',
        message: (fresh.company || '?') + ' · ' + (fresh.role || '?') +
          ' · score ' + (fresh.geminiScore ?? 0).toFixed(1),
      });

      const r = await runOferta(job.url, 'auto-eval');
      if (r.ok) {
        evaluated++;
        consecutive = 0;
      } else {
        failed++;
        consecutive++;
        if (consecutive >= AUTO_EVAL_FAILURE_CIRCUIT) {
          aborted = 'cli-error';
          logEvent('auto-eval', 'Auto-eval aborted: 3 consecutive failures', {
            level: 'warn',
            category: 'task',
            message: 'Check Claude CLI availability + ANTHROPIC_API_KEY. ' +
              evaluated + ' eval\'d before abort.',
          });
          break;
        }
      }
    }
  } finally {
    running.delete('auto-eval');
  }

  // -------- Summary --------
  // 'Task finished' suffix is what autopilot.ts's scheduler bus listener
  // matches on (`title.endsWith('finished')`), so trackResult will fire and
  // the schedule's lastRunResult + lastRunMessage update automatically.
  const ok = aborted == null && (evaluated > 0 || failed === 0);
  logEvent('auto-eval', ok ? 'Task finished' : 'Task failed', {
    level: ok ? 'success' : 'warn',
    category: 'task',
    message: 'Auto-eval ' + (aborted ? 'aborted (' + aborted + ')' : 'finished') +
      ': ' + evaluated + ' eval\'d · ' + skipped + ' skipped · ' + failed + ' failed',
  });

  return { ok, evaluated, skipped, failed, aborted };
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
    attachStdio(p, 'apply-linkedin');
    attachTimeout(p, 'apply-linkedin', TIMEOUT_MS['apply-linkedin']);
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
  // Register exit handlers so spawned children don't outlive the dev server.
  // Idempotent across HMR reloads (re-import re-creates `cleanupInstalled`
  // but `process.once` fires only once per signal).
  installChildCleanup();
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
  // Install the pluggable job registry. Each *.job.ts module registers its
  // own JobDef; this barrel triggers all of them at boot. Failure here
  // shouldn't block boot — log + continue.
  import('./jobs')
    .then((m) => m.installAllJobs())
    .catch((err) => {
      logEvent('boot', 'Job registry failed to install', {
        level: 'error',
        category: 'system',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  const pipelinePath = activePath('pipeline');
  const geminiPath = activePath('gemini-scores');
  const pipelineExists = fs.existsSync(pipelinePath);
  const geminiExists = fs.existsSync(geminiPath);
  logEvent('boot', 'Server started', { category: 'system' });
  if (!pipelineExists || fs.statSync(pipelinePath).size < 200) {
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
