import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './files';
import { activePath } from './profile-paths';
import { logEvent } from './events';
import { loadEnv } from './env';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { BRAND } from '$lib/client/brand';
import { AGENT_CLI } from '$lib/config/cli';
import { maybeCurrentUserId, SYSTEM_USER_ID } from './user-context';
import { getActiveProfileId } from './profiles';
import { realizeModePromptForUser } from './mode-substitution';
import { profilePathForUser } from './profile-paths';

loadEnv();

type TaskName =
  | 'scan'
  | 'gemini'
  | 'oferta'
  | 'pdf'
  | 'apply-linkedin'
  | 'bulk-cv'
  | 'bulk-apply'
  | 'auto-eval';
const running = new Map<TaskName, ChildProcess>();

function venvPython(): string {
  const p = path.join(ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(p)) return p;
  return 'python3';
}

// D14 — `isRunning` removed; callers consult `listRunning()` instead, and
// the job registry has its own `isRunning(jobId)` for registered jobs.
export function listRunning(): string[] {
  return [...running.keys()];
}

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
  scan: 30 * 60_000, // 30 min
  gemini: 15 * 60_000, // 15 min
  oferta: 10 * 60_000, // 10 min — a single Claude oferta run
  pdf: 5 * 60_000, // 5 min
  'apply-linkedin': 30 * 60_000, // 30 min — Playwright + login + apply
  'bulk-cv': 4 * 60 * 60_000, // 4h — covers the largest realistic batch
  'bulk-apply': 2 * 60 * 60_000, // 2h
  'auto-eval': 60 * 60_000, // 60 min — up to 10 oferta runs × 3min + headroom
};

const MAX_STDOUT_BUF = 1024 * 1024; // 1MB — see comment above
const MAX_LINES_PER_SEC = 100;

/**
 * Attach stdout + stderr line-by-line forwarders that go through `logEvent`.
 * Replaces ~5 copy-pasted blocks across this file. Bounds memory + log volume.
 */
function attachStdio(
  p: ChildProcess,
  taskName: TaskName,
  opts: { stderrLevel?: 'warn' | 'error' } = {},
): void {
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
        stdoutBuf.slice(0, 200) +
          '… [truncated · no newline within ' +
          MAX_STDOUT_BUF / 1024 +
          'KB]',
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
    try {
      p.kill('SIGTERM');
    } catch {
      /* process already exited — kill races with the close event */
    }
    const hard = setTimeout(() => {
      if (p.exitCode !== null) return;
      try {
        p.kill('SIGKILL');
      } catch {
        /* process already exited — kill races with the close event */
      }
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
// D15: kept internal — only `bootOnce()` calls this. Removed the export.
function installChildCleanup(): void {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  const killAll = () => {
    for (const [, child] of running.entries()) {
      const c = child as ChildProcess | null;
      if (c && typeof c.kill === 'function' && c.exitCode === null) {
        try {
          c.kill('SIGTERM');
        } catch {
          /* child already dead between exitCode check + kill call */
        }
      }
    }
    running.clear();
  };
  // 'beforeExit' fires when the loop empties; dev-server reloads also fire
  // SIGTERM/SIGINT depending on host. Cover all three.
  process.once('beforeExit', killAll);
  process.once('SIGTERM', () => {
    killAll();
    process.exit(0);
  });
  process.once('SIGINT', () => {
    killAll();
    process.exit(0);
  });
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
  // Inject the current user's id into the spawned env. Both lib_profiles.py
  // and lib-profiles.mjs honor `CAREER_OPS_USER_ID` as a fallback for the
  // `--user` CLI flag, so even scripts that don't yet accept the flag
  // pick up the right user's data tree automatically.
  const ctxUserId = maybeCurrentUserId();
  const envWithUser: NodeJS.ProcessEnv = { ...process.env };
  if (ctxUserId && ctxUserId !== SYSTEM_USER_ID) {
    envWithUser.CAREER_OPS_USER_ID = ctxUserId;
  } else if (process.env.CAREER_OPS_USER_ID) {
    // Inherit any pre-set var (autopilot jobs may set it explicitly before
    // calling start()).
    envWithUser.CAREER_OPS_USER_ID = process.env.CAREER_OPS_USER_ID;
  }
  try {
    p = spawn(cmd, args, { cwd, env: envWithUser });
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
    // P18: tag the always-on source counter when this is one of the scan
    // jobs that has a KNOWN_SOURCES entry. recordSuccess/Failure is a
    // no-op for any other task name, so this is safe to call broadly.
    if (name === 'scan') {
      try {
        const { recordSuccess, recordFailure } = require('./sources') as typeof import('./sources');
        if (code === 0) recordSuccess('scan-broad');
        else if (code !== null) recordFailure('scan-broad', new Error('exit ' + code));
      } catch (e) {
        // sources record best-effort — log but don't fail the close handler.
        logEvent(name, 'Could not update sources counter for scan-broad', {
          level: 'warn',
          category: 'task',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (code === 0) {
      logEvent(name, 'Task finished', {
        level: 'success',
        category: 'task',
        message: 'Exit code 0 · ' + name,
      });
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

/** Resolve a profileId argument to CLI flags. Returns ['--profile', '<id>']
 *  when an explicit id is passed; empty array when omitted (script reads
 *  active profile via lib-profiles helpers). */
function profileFlags(profileId?: string): string[] {
  return profileId ? ['--profile', profileId] : [];
}

export function runScan(profileId?: string) {
  start('scan', venvPython(), ['scripts/scan/scan-broad.py', ...profileFlags(profileId)]);
}

export function runGemini(top = 30, profileId?: string) {
  if (!process.env.GEMINI_API_KEY) {
    logEvent('gemini', 'Gemini API key not set', {
      level: 'error',
      category: 'task',
      message: 'Add it in Settings to enable first-pass scoring.',
      link: '/settings',
    });
    return;
  }
  start('gemini', venvPython(), [
    'scripts/scan/gemini-first-pass.py',
    '--top',
    String(top),
    ...profileFlags(profileId),
  ]);
}

/**
 * Login flow for an authenticated portal — opens Playwright, lets the user
 * sign in, persists the session to `.playwright-<portal>/`. P14: previously
 * hardcoded to LinkedIn; now generalised to support Indeed too via the
 * shared lib_playwright_auth.py helper (same module used by
 * /api/sources/[id]/connect).
 *
 * `runLinkedInLogin` remains as a thin shim for backward compatibility
 * with the /api/run switch.
 */
export function runPortalLogin(portal: 'linkedin' | 'indeed') {
  // Login is profile-agnostic — it writes the Playwright session to a
  // shared dir (.playwright-<portal>/) that all profiles use.
  if (portal === 'linkedin') {
    start('apply-linkedin', venvPython(), ['scripts/apply/linkedin-easy-apply.py', '--login']);
  } else {
    start('apply-linkedin', venvPython(), [
      'scripts/lib/lib_playwright_auth.py',
      '--portal',
      'indeed',
      '--login',
    ]);
  }
}

export function runLinkedInLogin() {
  runPortalLogin('linkedin');
}

export function runLinkedInApply(autoSubmit = false, url?: string, profileId?: string) {
  if (running.has('apply-linkedin')) {
    logEvent('apply-linkedin', 'LinkedIn apply already running', {
      level: 'warn',
      category: 'task',
      message: 'Wait for the current run to finish — concurrent LinkedIn sessions get flagged.',
    });
    return;
  }
  // Enforce autopilot's per-day apply cap. The cap is a real cost / shadowban
  // safety knob — every Submit risks LinkedIn flagging the session — so we
  // honour it on both per-URL and queue-mode invocations.
  try {
    const { readConfig } = require('./autopilot') as typeof import('./autopilot');
    const { todayCount } = require('./apply-counter') as typeof import('./apply-counter');
    const cap = readConfig().thresholds.maxAppliesPerDay;
    if (todayCount() >= cap) {
      logEvent('apply-linkedin', 'Apply cap reached for today', {
        level: 'warn',
        category: 'task',
        message:
          'today=' + todayCount() + ' · cap=' + cap + '. Adjust via /autopilot → Thresholds.',
      });
      return;
    }
  } catch (e) {
    // Non-fatal: fall through if autopilot/apply-counter modules aren't
    // loadable yet (boot race during HMR). Without the cap check the
    // user might exceed their daily apply target — worth logging so the
    // operator notices the regression if it keeps recurring.
    logEvent('apply-linkedin', 'Apply-cap check skipped (modules not ready)', {
      level: 'warn',
      category: 'task',
      message: e instanceof Error ? e.message : String(e),
    });
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (autoSubmit) env.LINKEDIN_AUTO_SUBMIT = '1';
  // Pass the acting user id so lib_profiles.py resolves the right
  // data/users/{userId}/profiles/{slug}/ tree.
  const _uid = maybeCurrentUserId();
  if (_uid && _uid !== SYSTEM_USER_ID) env.CAREER_OPS_USER_ID = _uid;
  // Surface up-front whether the general CV is missing for the targeted profile.
  let cvNote = '';
  try {
    const { generalCvStatus } = require('./cv-pdf') as typeof import('./cv-pdf');
    const s = generalCvStatus(profileId);
    if (!s.exists) {
      cvNote = ' · WARN: no general CV — resume upload will be skipped';
    } else if (s.outdated) {
      cvNote = ' · NOTE: general CV is older than cv.md — regenerate from /profile';
    }
  } catch (e) {
    // Non-fatal: cv-pdf module not ready or generalCvStatus threw.
    // The user won't see the upfront warning but the apply will still
    // proceed (worst case: the worker reports the missing CV itself).
    logEvent('apply-linkedin', 'CV status pre-check failed', {
      level: 'warn',
      category: 'task',
      message: e instanceof Error ? e.message : String(e),
      profileId,
    });
  }
  logEvent('apply-linkedin', 'LinkedIn Easy Apply started', {
    category: 'task',
    message:
      (url ? 'single URL: ' + url : 'queue mode · autoSubmit=' + autoSubmit) +
      (profileId ? ' · profile=' + profileId : '') +
      cvNote,
  });
  const args = ['scripts/apply/linkedin-easy-apply.py', ...profileFlags(profileId)];
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
      // Successful apply path — bump the daily counter so the cap covers
      // subsequent fires within today. For queue-mode we conservatively
      // bump by 1 even though the queue may have applied to multiple
      // postings; the Python script is responsible for re-checking the
      // cap internally for queue-mode multi-applies.
      try {
        const { bumpApplyCounter } = require('./apply-counter') as typeof import('./apply-counter');
        const n = bumpApplyCounter();
        logEvent('apply-linkedin', 'LinkedIn apply finished', {
          level: 'success',
          category: 'task',
          message:
            (url ? 'Applied: ' + url : 'Queue exhausted — see counts in /applied') +
            ' · today=' +
            n,
        });
      } catch (e) {
        // Counter bump failed — apply still succeeded so we surface success,
        // but warn so the operator knows the daily-cap accounting is off.
        logEvent('apply-linkedin', 'Apply counter bump failed', {
          level: 'warn',
          category: 'task',
          message: e instanceof Error ? e.message : String(e),
        });
        logEvent('apply-linkedin', 'LinkedIn apply finished', {
          level: 'success',
          category: 'task',
          message: url ? 'Applied: ' + url : 'Queue exhausted — see counts in /applied',
        });
      }
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
        message:
          'Exit code ' +
          code +
          ' — common causes: LinkedIn re-login required, rate-limit, captcha. Run "Re-login to LinkedIn" from Settings.',
      });
    }
  });
}

// =============================================================================
// Tailored CV / oferta — spawn the Claude Code CLI to run the oferta mode for
// a single URL. Claude's `/heron oferta <url>` produces a deep evaluation
// report AND a tailored CV PDF in one shot.
//
// We pin Claude Code (the CLI) here. Other CLIs follow the open agent skill
// standard but their headless flags and prompt formats differ; this is the
// pragmatic choice for now. If Claude isn't on PATH, the spawn fails with
// ENOENT and we surface a clean error in the activity feed.
// =============================================================================

export type OfertaResult = { ok: boolean; code: number | null };

/**
 * Spawn the Claude CLI to run the oferta mode for a single URL.
 *
 * Multi-profile note: the oferta slash-command reads cv.md / profile.yml /
 * portals.yml via the AGENTS.md instructions, which still point at the
 * repo-root flat-layout paths. Until those instructions are updated (out of
 * scope for now), we maintain a per-profile symlink set at the repo root
 * before spawning so the active profile's files are at the expected paths.
 * The symlinks are atomic-swap on each call so a concurrent oferta for a
 * different profile is guaranteed to see consistent state.
 */
export function runOferta(
  url: string,
  taskKey: TaskName = 'oferta',
  profileId?: string,
): Promise<OfertaResult> {
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
    // Resolve the active profile if the caller didn't pass one.
    const resolvedProfileId = profileId ?? getActiveProfileId();

    logEvent(taskKey, 'Generate CV started', {
      category: 'task',
      message: 'oferta · ' + url + ' · profile=' + resolvedProfileId,
      profileId: resolvedProfileId,
    });
    let p: ChildProcess;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { spawnAgentWithMode } = require('./spawn-agent') as typeof import('./spawn-agent');
      ({ child: p } = spawnAgentWithMode('oferta', url, {
        profileId: resolvedProfileId,
      }));
    } catch (e) {
      logEvent(taskKey, 'Failed to spawn ' + AGENT_CLI + ' CLI', {
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
      logEvent(taskKey, 'Failed to spawn ' + AGENT_CLI + ' CLI', {
        level: 'error',
        category: 'task',
        message: isMissingBinary
          ? '`' + AGENT_CLI + '` not found on PATH — install it or override via AGENT_CLI env var.'
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
          : 'Exit code ' +
            code +
            ' — review the spawned process output above. Common causes: rate limits, prompt errors, missing CV file.',
        profileId,
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
 * Parallel bulk-CV — wraps scripts/batch/batch-runner.sh which orchestrates N
 * concurrent `claude -p` workers. Faster than the sequential `runBulkOferta`
 * but consumes more Anthropic credits in parallel; the dialog explains the
 * tradeoff. Writes <profile>/batch/batch-input.tsv from the URL list, kicks off
 * the shell script, and streams output to the activity feed.
 *
 * Returns a coarse summary; per-job tracker rows are merged in by the
 * auto-merge fs watcher (`auto-merge-batch.ts`) once batch-runner.sh
 * writes its tracker-additions/ TSVs.
 */
export async function runBulkOfertaParallel(
  urls: string[],
  workers: number,
  profileId?: string,
): Promise<{ started: boolean; total: number }> {
  if (running.has('bulk-cv')) {
    logEvent('bulk-cv', 'Bulk CV already running', { level: 'warn', category: 'task' });
    return { started: false, total: 0 };
  }
  if (urls.length === 0) return { started: false, total: 0 };
  // Pre-resolve the __TOKEN__ placeholders in batch-prompt.md against
  // the active profile + write the realized prompt to a temp file. The
  // batch worker (batch-runner.sh) then layers its per-job substitutions
  // ({{URL}}, {{JD_FILE}}, etc.) on top before passing to the AI CLI.
  // Resolving profile-paths happens HERE (not in bash) so we don't have
  // to teach the shell script about the multi-user profile layout.
  const resolvedProfileId = profileId ?? getActiveProfileId();
  const userId = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  let batchPromptTempFile: string | undefined;
  try {
    const realizedPrompt = realizeModePromptForUser(
      userId,
      resolvedProfileId,
      path.join(ROOT, 'templates', 'batch-prompt.md'),
    );
    batchPromptTempFile = path.join(
      require('node:os').tmpdir(),
      `${BRAND.name}-batch-prompt-` + Date.now() + '.md',
    );
    fs.writeFileSync(batchPromptTempFile, realizedPrompt, 'utf8');
  } catch (e) {
    logEvent('bulk-cv', 'Failed to resolve batch-prompt tokens', {
      level: 'error',
      category: 'task',
      message: e instanceof Error ? e.message : String(e),
    });
    return { started: false, total: 0 };
  }

  // Build the batch-input.tsv from the URL list. Format expected by
  // batch-runner.sh (per `scripts/batch/batch-runner.sh` parsing):
  //   <num>\t<url>\t<company>\t<role>
  // We don't know company/role here from the URL alone — leave blank, the
  // worker prompt fills them in. Path is per-profile post-Option-D.
  const batchDir = profilePathForUser(userId, resolvedProfileId, 'batch-dir');
  const inputPath = path.join(batchDir, 'batch-input.tsv');
  try {
    fs.mkdirSync(batchDir, { recursive: true });
    const rows = urls.map((u, i) => i + 1 + '\t' + u + '\t\t');
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
    p = spawn('bash', ['scripts/batch/batch-runner.sh', '--parallel', String(w)], {
      cwd: ROOT,
      env: {
        ...process.env,
        // Tell batch-runner.sh to use the pre-resolved prompt (tokens
        // expanded against the active profile) instead of reading
        // templates/batch-prompt.md literally.
        ...(batchPromptTempFile ? { BATCH_PROMPT_FILE: batchPromptTempFile } : {}),
        // Forward both the active user AND profile so every per-user
        // per-profile path inside the runner (REPORTS_DIR,
        // APPLICATIONS_FILE, BATCH_DIR) resolves to the right
        // data/users/{uid}/profiles/{slug}/ subtree.
        CAREER_OPS_USER_ID: userId,
        CAREER_OPS_PROFILE_ID: resolvedProfileId,
        CAREER_OPS_BATCH_DIR: batchDir,
      },
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

export async function runBulkOferta(
  urls: string[],
  profileId?: string,
): Promise<{ ok: number; failed: number; total: number }> {
  if (running.has('bulk-cv')) {
    logEvent('bulk-cv', 'Bulk CV already running', { level: 'warn', category: 'task' });
    return { ok: 0, failed: 0, total: 0 };
  }
  // Reserve the slot synchronously — spawn() runs inside runOferta with a different key
  running.set('bulk-cv', null as any);
  logEvent('bulk-cv', 'Bulk CV started', {
    category: 'task',
    message: urls.length + ' job(s) queued' + (profileId ? ' · profile=' + profileId : ''),
  });
  let ok = 0;
  let failed = 0;
  try {
    for (let i = 0; i < urls.length; i++) {
      logEvent('bulk-cv', 'Bulk CV ' + (i + 1) + '/' + urls.length, {
        category: 'task',
        message: urls[i],
      });
      const r = await runOferta(urls[i], 'oferta', profileId);
      if (r.ok) ok++;
      else failed++;
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

export async function runAutoEval(profileId?: string): Promise<AutoEvalResult> {
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

  // -------- Resolve target profile(s) --------
  // Without an explicit profileId, iterate every profile so a single
  // auto-eval run after the daily scan covers every track. The orchestrator
  // serialises across profiles to avoid burning the per-run cap on one
  // profile while starving another.
  const { listProfiles } = await import('./profiles');
  const profilesToRun = profileId ? [profileId] : listProfiles().map((p) => p.id);

  // -------- Build candidate list per profile --------
  const { loadAllJobs } = await import('./parsers');
  const threshold = cfg.thresholds.autoEvaluateScore;
  const cap = cfg.thresholds.maxAutoEvalsPerRun ?? 10;

  // For each profile, gather candidates up to the cap. Across profiles
  // we still respect the same cap — a single auto-eval run is the user's
  // budget for that timeslice, multi-profile or not.
  type Candidate = {
    url: string;
    profileId: string;
    company: string;
    role: string;
    geminiScore: number;
  };
  const allCandidates: Candidate[] = [];
  for (const pid of profilesToRun) {
    const profileCandidates = loadAllJobs(pid)
      .filter((j) => j.geminiScore != null && j.geminiScore >= threshold)
      .filter((j) => !j.reportFile)
      .filter((j) => j.status === 'Scored')
      .sort((a, b) => (b.geminiScore ?? 0) - (a.geminiScore ?? 0))
      .map((j) => ({
        url: j.url,
        profileId: pid,
        company: j.company || '?',
        role: j.role || '?',
        geminiScore: j.geminiScore ?? 0,
      }));
    allCandidates.push(...profileCandidates);
  }

  // Global sort by score desc, then take the top `cap` across all profiles.
  allCandidates.sort((a, b) => b.geminiScore - a.geminiScore);
  const candidates = allCandidates.slice(0, cap);

  if (candidates.length === 0) {
    logEvent('auto-eval', 'Auto-eval: nothing to do', {
      level: 'info',
      category: 'task',
      message:
        'No Scored jobs with geminiScore ≥ ' +
        threshold.toFixed(1) +
        ' awaiting deep eval (across ' +
        profilesToRun.length +
        ' profile(s))',
    });
    return { ok: true, evaluated: 0, skipped: 0, failed: 0 };
  }

  // -------- Reserve slot + start batch --------
  running.set('auto-eval', null as unknown as ChildProcess);
  logEvent('auto-eval', 'Task started', {
    category: 'task',
    message:
      'Auto-eval started: ' +
      candidates.length +
      ' jobs (score ≥ ' +
      threshold.toFixed(1) +
      ', cap ' +
      cap +
      ', profiles=' +
      profilesToRun.length +
      ')',
  });

  let evaluated = 0;
  let skipped = 0;
  let failed = 0;
  let consecutive = 0;
  let aborted: AutoEvalResult['aborted'];

  try {
    for (let i = 0; i < candidates.length; i++) {
      const job = candidates[i];

      // Re-check this candidate against its profile's current state. A
      // manual eval / status flip mid-batch should remove the URL from
      // our queue automatically. Cheap — in-memory file reads.
      const fresh = loadAllJobs(job.profileId).find((j) => j.url === job.url);
      if (!fresh) {
        skipped++;
        continue;
      }
      if (fresh.reportFile) {
        skipped++;
        continue;
      }
      if (fresh.status !== 'Scored') {
        skipped++;
        continue;
      }

      logEvent('auto-eval', 'Auto-eval ' + (i + 1) + '/' + candidates.length, {
        category: 'task',
        message:
          '[' +
          job.profileId +
          '] ' +
          job.company +
          ' · ' +
          job.role +
          ' · score ' +
          job.geminiScore.toFixed(1),
      });

      const r = await runOferta(job.url, 'auto-eval', job.profileId);
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
            message:
              'Check Claude CLI availability + ANTHROPIC_API_KEY. ' +
              evaluated +
              " eval'd before abort.",
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
    message:
      'Auto-eval ' +
      (aborted ? 'aborted (' + aborted + ')' : 'finished') +
      ': ' +
      evaluated +
      " eval'd · " +
      skipped +
      ' skipped · ' +
      failed +
      ' failed',
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

export type BulkApplyOutcome = {
  url: string;
  mode: 'linkedin' | 'mark';
  ok: boolean;
  error?: string;
};

function runLinkedInApplyAwait(url: string): Promise<{ ok: boolean; capped?: boolean }> {
  return new Promise((resolve) => {
    // Cap check: same enforcement as the fire-and-forget path. Treats
    // "cap reached" as a non-error skip — caller can interpret the
    // `capped: true` flag.
    try {
      const { readConfig } = require('./autopilot') as typeof import('./autopilot');
      const { todayCount } = require('./apply-counter') as typeof import('./apply-counter');
      const cap = readConfig().thresholds.maxAppliesPerDay;
      if (todayCount() >= cap) {
        logEvent('apply-linkedin', 'Apply cap reached for today', {
          level: 'warn',
          category: 'task',
          message: 'url=' + url + ' · today=' + todayCount() + ' · cap=' + cap,
        });
        resolve({ ok: false, capped: true });
        return;
      }
    } catch (e) {
      // Non-fatal — bulk apply proceeds without the cap check. Warn so
      // operator notices the regression if it keeps recurring.
      logEvent('apply-linkedin', 'Bulk apply cap-check skipped (modules not ready)', {
        level: 'warn',
        category: 'task',
        message: e instanceof Error ? e.message : String(e),
      });
    }

    // Forward CAREER_OPS_USER_ID so the Python script resolves the right
    // data/users/{userId}/profiles/{slug}/ tree under multi-user.
    const env: NodeJS.ProcessEnv = { ...process.env };
    const _uid = maybeCurrentUserId();
    if (_uid && _uid !== SYSTEM_USER_ID) env.CAREER_OPS_USER_ID = _uid;

    let p: ChildProcess;
    try {
      p = spawn(venvPython(), ['scripts/apply/linkedin-easy-apply.py', '--url', url], {
        cwd: ROOT,
        env,
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
        message: isMissingBinary ? 'Python or .venv missing. Set up venv first.' : err.message,
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
      // Successful per-job apply — bump counter so the bulk caller's
      // subsequent iterations see the updated daily count.
      if (code === 0) {
        try {
          const { bumpApplyCounter } =
            require('./apply-counter') as typeof import('./apply-counter');
          bumpApplyCounter();
        } catch (e) {
          // Non-fatal — apply succeeded, but the bulk caller's
          // subsequent iterations won't see the updated daily count.
          logEvent('apply-linkedin', 'Per-job apply counter bump failed', {
            level: 'warn',
            category: 'task',
            message: 'url=' + url + ' · ' + (e instanceof Error ? e.message : String(e)),
          });
        }
      }
      resolve({ ok: code === 0 });
    });
  });
}

export async function runBulkApply(
  jobs: { url: string; isLinkedIn: boolean }[],
): Promise<BulkApplyOutcome[]> {
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
        outcomes.push({
          url: j.url,
          mode: 'linkedin',
          ok: r.ok,
          error: r.ok
            ? undefined
            : r.capped
              ? 'Apply cap reached for today — skipped'
              : 'LinkedIn Easy Apply exited non-zero',
        });
        // If we just hit the cap, stop iterating — subsequent calls would
        // also be no-ops and just spam the activity feed.
        if (r.capped) break;
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
  // CRITICAL: every spawn-y / IO-y branch below is wrapped in
  // try/catch so a failure can NEVER bubble out of bootOnce(). This
  // function runs at the TOP of hooks.server.ts (line 8 — outside
  // any handler), so any uncaught error crashes the whole hooks
  // module — and SvelteKit responds with the bare "500 | Internal
  // Error" white page that bypasses our +error.svelte entirely. Even
  // when the user is just trying to load /login, a stray scan-spawn
  // failure here would lock them out. Log and continue instead.
  if (!pipelineExists || fs.statSync(pipelinePath).size < 200) {
    logEvent('boot', 'Pipeline empty — running auto-scan', {
      category: 'system',
      message: 'Spawning scan-broad.py',
    });
    try {
      runScan();
    } catch (e) {
      logEvent('boot', 'Auto-scan failed (continuing)', {
        level: 'warn',
        category: 'system',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }
  if (!geminiExists && process.env.GEMINI_API_KEY) {
    logEvent('boot', 'Auto-scoring new pipeline', {
      category: 'system',
      message: 'Spawning gemini-first-pass.py',
    });
    try {
      runGemini(30);
    } catch (e) {
      logEvent('boot', 'Auto-score failed (continuing)', {
        level: 'warn',
        category: 'system',
        message: e instanceof Error ? e.message : String(e),
      });
    }
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
  logEvent('boot', 'Ready', {
    level: 'success',
    category: 'system',
    message: 'Pipeline + scores already populated',
  });
}
