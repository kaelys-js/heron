/**
 * Autopilot — recurring + event-triggered task schedules.
 *
 * Config lives in `data/autopilot.json` and is the source of truth.
 * The scheduler runs in-process while the dashboard is up; this is documented
 * in the UI so users aren't surprised by it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { installBusListener, removeBusListener, logEvent, reportServerError } from './events';
import { listRunning, runScan, runGemini, runLinkedInApply, runAutoEval } from './orchestrator';
import type { ActivityEvent } from '$lib/types';
import { get as getJob, runById as runJobById } from './jobs';

const CONFIG_PATH = path.join(ROOT, 'data', 'autopilot.json');

/** Task name — any registered job id. The legacy literal union is kept as
 *  a type alias for readability + boot-time defaults; runtime treats
 *  Schedule.task as an open string so new jobs work without code changes. */
export type TaskName = string;
export type ScheduleId = string;

export type DailyTrigger = {
  type: 'daily';
  hour: number;
  minute: number;
  /** 0=Sunday, 6=Saturday. Empty array = every day. */
  weekdays: number[];
};
export type AfterTrigger = {
  type: 'after';
  /** Source task id this schedule fires after. Any registered job id is OK. */
  task: TaskName;
};
export type Trigger = DailyTrigger | AfterTrigger;

export type Schedule = {
  id: ScheduleId;
  /** Display name shown in UI */
  name: string;
  /** One-sentence description shown in UI */
  description: string;
  /** Multi-line "what this actually does" — shown in the expandable detail panel */
  details: string[];
  /** Visible label on the linked task (icon legend) */
  taskLabel: string;
  task: TaskName;
  enabled: boolean;
  trigger: Trigger;
  args?: Record<string, unknown>;
  lastRunAt?: number;
  lastRunResult?: 'success' | 'failure' | 'started';
  lastRunMessage?: string;
};

export type AutopilotConfig = {
  globalEnabled: boolean;
  schedules: Schedule[];
  thresholds: {
    /** Auto-eval triggers when Gemini scoring tags a job ≥ this score. */
    autoEvaluateScore: number;
    /** Auto-eval batch is capped at this many oferta runs per fire. Each
     *  run costs ~$0.30–$1.00 of Claude usage, so a low cap is a real
     *  cost-safety knob, not just a perf knob. */
    maxAutoEvalsPerRun: number;
    /** LinkedIn Easy Apply caps at this number of submissions per UTC day. */
    maxAppliesPerDay: number;
  };
};

const DEFAULT_CONFIG: AutopilotConfig = {
  globalEnabled: false,
  schedules: [
    {
      id: 'daily-scan',
      name: 'Daily job scan',
      description: 'Pull new postings from every configured job source every morning.',
      details: [
        'Runs scan-broad.py against LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs, The Muse, RemoteOK, We Work Remotely, HN Who\'s Hiring, and (if keys set) Adzuna.',
        'Title-filtered against your archetype — drops obvious mismatches before they hit the pipeline.',
        'Dedupes against scan-history.tsv so the same posting isn\'t re-added.',
        'Typical run: 3–5 minutes, finds 30–80 new postings.',
      ],
      taskLabel: 'scan-broad.py',
      task: 'scan',
      enabled: false,
      trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [] },
    },
    {
      id: 'auto-gemini-after-scan',
      name: 'Auto-score after scan',
      description: 'Score new postings with Gemini immediately after each scan finishes.',
      details: [
        'Triggers gemini-first-pass.py whenever a scan completes successfully.',
        'Cheap (free Gemini Flash tier, ~1M tokens/day). Title-only first-pass — no JD content fetched.',
        'Outputs to data/gemini-scores.tsv. Top 30 unscored jobs by default; configurable via args.top.',
        'Skipped automatically if GEMINI_API_KEY isn\'t set.',
      ],
      taskLabel: 'gemini-first-pass.py',
      task: 'gemini',
      enabled: true,
      trigger: { type: 'after', task: 'scan' },
      args: { top: 30 },
    },
    {
      id: 'auto-eval-after-gemini',
      name: 'Auto deep-eval high-fit jobs',
      description: 'After Gemini scoring, run a deep Claude evaluation + generate a tailored CV PDF for every job scoring ≥ Auto-evaluate score.',
      details: [
        'Triggers after every successful gemini-first-pass.py run.',
        'Picks up to N jobs (Max auto-evals / run) sorted by Gemini score, descending.',
        'Each oferta run takes 1–3 min and costs ~$0.30–$1.00 in Claude usage.',
        'Skips jobs that already have a deep-eval report. Skips jobs the user moved past Scored.',
        'Aborts the batch after 3 consecutive failures (likely Claude CLI broken or API key revoked).',
        '1-hour cooldown between runs prevents accidental double-billing from manual scan retries.',
        'Off by default — flip the toggle to enable. Tune via the "Auto-evaluate score" + "Max auto-evals / run" thresholds below.',
      ],
      taskLabel: 'auto-eval (orchestrator)',
      task: 'auto-eval',
      enabled: false,
      trigger: { type: 'after', task: 'gemini' },
    },
    {
      id: 'weekday-apply',
      name: 'Weekday LinkedIn Easy Apply',
      description: 'Auto-fill LinkedIn Easy Apply forms on weekdays. You review before Submit.',
      details: [
        'Runs linkedin-easy-apply.py via Playwright against your saved LinkedIn session.',
        'Auto-fills questions, uploads the latest CV PDF, advances through pages — but always pauses at the Submit button.',
        'You can review the application and click Submit yourself, or close the tab to abort.',
        'Capped by the "Max applies / day" threshold below to avoid rate-limit / shadowban risk.',
      ],
      taskLabel: 'linkedin-easy-apply.py',
      task: 'apply-linkedin',
      enabled: false,
      trigger: { type: 'daily', hour: 10, minute: 30, weekdays: [1, 2, 3, 4, 5] },
    },
  ],
  thresholds: {
    autoEvaluateScore: 4.0,
    maxAutoEvalsPerRun: 10,
    maxAppliesPerDay: 30,
  },
};

let cached: AutopilotConfig | null = null;

export function readConfig(): AutopilotConfig {
  if (cached) return cached;
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      writeConfig(DEFAULT_CONFIG);
      cached = DEFAULT_CONFIG;
      return cached;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AutopilotConfig>;
    cached = mergeWithDefaults(parsed);
    return cached;
  } catch (e) {
    reportServerError('autopilot', 'Failed to read config — falling back to defaults', e);
    cached = DEFAULT_CONFIG;
    return cached;
  }
}

function mergeWithDefaults(partial: Partial<AutopilotConfig>): AutopilotConfig {
  // Always carry forward the canonical metadata (name, description, details, taskLabel)
  // from the defaults so they evolve across releases without users wiping their config.
  const out: AutopilotConfig = {
    globalEnabled: partial.globalEnabled ?? DEFAULT_CONFIG.globalEnabled,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(partial.thresholds ?? {}) },
    schedules: DEFAULT_CONFIG.schedules.map((d) => {
      const found = partial.schedules?.find((s) => s.id === d.id);
      if (!found) return { ...d };
      return {
        ...d,
        enabled: found.enabled ?? d.enabled,
        trigger: found.trigger ?? d.trigger,
        args: found.args ?? d.args,
        lastRunAt: found.lastRunAt,
        lastRunResult: found.lastRunResult,
        lastRunMessage: found.lastRunMessage,
      };
    }),
  };
  return out;
}

export function writeConfig(next: AutopilotConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  cached = next;
}

export function patchConfig(patch: Partial<AutopilotConfig>): AutopilotConfig {
  const current = readConfig();
  const next: AutopilotConfig = {
    ...current,
    ...patch,
    thresholds: { ...current.thresholds, ...(patch.thresholds ?? {}) },
    schedules: patch.schedules
      ? patch.schedules.map((s) => {
          const existing = current.schedules.find((c) => c.id === s.id);
          return { ...(existing ?? s), ...s };
        })
      : current.schedules,
  };
  writeConfig(next);
  return next;
}

function startOfTodayLocal(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextMatchTimestamp(t: DailyTrigger, from: number = Date.now()): number {
  const days = t.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : t.weekdays;
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(t.hour, t.minute, 0, 0);
    if (d.getTime() <= from) continue;
    if (!days.includes(d.getDay())) continue;
    return d.getTime();
  }
  return from + 7 * 24 * 60 * 60 * 1000;
}

export function nextRunAt(s: Schedule): number | null {
  if (!s.enabled) return null;
  if (s.trigger.type !== 'daily') return null;
  return nextMatchTimestamp(s.trigger);
}

async function runTask(s: Schedule): Promise<void> {
  if (listRunning().includes(s.task)) {
    logEvent('autopilot', 'Skipped: ' + s.name, {
      level: 'warn',
      category: 'system',
      message: 'Task ' + s.task + ' already running',
    });
    return;
  }
  logEvent('autopilot', 'Triggering ' + s.name, { category: 'system', message: 'task=' + s.task });
  patchSchedule(s.id, { lastRunAt: Date.now(), lastRunResult: 'started' });

  // Pluggable path: any registered job (legacy 3 + every Phase 1+ hygiene job)
  // can be invoked by id. Falls back to the legacy direct calls only if the
  // registry hasn't been installed yet (boot race).
  const def = getJob(s.task);
  if (def) {
    await runJobById(s.task, s.args ?? {});
    return;
  }
  switch (s.task) {
    case 'scan':
      runScan();
      break;
    case 'gemini':
      runGemini((s.args?.top as number) ?? 30);
      break;
    case 'apply-linkedin':
      runLinkedInApply(false);
      break;
    case 'auto-eval':
      // Fire-and-forget — runAutoEval emits its own batch start/finish
      // events on the activity bus, and the scheduler's bus listener picks
      // those up to update lastRunResult. We don't await here because the
      // batch can run for up to an hour.
      runAutoEval().catch((err) => {
        logEvent('auto-eval', 'Task failed', {
          level: 'error',
          category: 'task',
          message: err instanceof Error ? err.message : String(err),
        });
      });
      break;
    default:
      logEvent('autopilot', 'Unknown task: ' + s.task, {
        level: 'error',
        category: 'system',
        message: 'No registered job and no legacy fallback for ' + s.task,
      });
  }
}

function patchSchedule(id: ScheduleId, patch: Partial<Schedule>): void {
  const cfg = readConfig();
  const next: AutopilotConfig = {
    ...cfg,
    schedules: cfg.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
  writeConfig(next);
}

export function runScheduleNow(id: ScheduleId): { ok: boolean; message: string } {
  const cfg = readConfig();
  const s = cfg.schedules.find((x) => x.id === id);
  if (!s) return { ok: false, message: 'Unknown schedule: ' + id };
  if (s.trigger.type === 'after') {
    return { ok: false, message: 'This schedule runs only when its trigger event fires (' + s.trigger.task + ').' };
  }
  runTask(s);
  return { ok: true, message: 'Triggered ' + s.name };
}

function onTaskCompleted(task: TaskName): void {
  const cfg = readConfig();
  if (!cfg.globalEnabled) return;
  for (const s of cfg.schedules) {
    if (!s.enabled) continue;
    if (s.trigger.type === 'after' && s.trigger.task === task) {
      logEvent('autopilot', 'After-trigger: ' + s.name, { category: 'system', message: 'after ' + task });
      runTask(s);
    }
  }
}

/** Update lastRunResult when a task finishes (regardless of who triggered it). */
function trackResult(task: TaskName, success: boolean, message?: string): void {
  const cfg = readConfig();
  let dirty = false;
  const next = cfg.schedules.map((s) => {
    if (s.task !== task) return s;
    if (s.lastRunResult !== 'started') return s;
    dirty = true;
    return { ...s, lastRunResult: (success ? 'success' : 'failure') as 'success' | 'failure', lastRunMessage: message };
  });
  if (dirty) writeConfig({ ...cfg, schedules: next });
}

let schedulerStarted = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const SCHEDULER_BUS_NAME = 'autopilot/scheduler-task-tracker';

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Subscribe to task lifecycle events on the bus (avoids a circular import with orchestrator).
  // installBusListener is HMR-idempotent — see events.ts.
  installBusListener(SCHEDULER_BUS_NAME, (ev: ActivityEvent) => {
    if (ev.category !== 'task') return;
    const task = ev.source as TaskName;
    if (!['scan', 'gemini', 'apply-linkedin', 'auto-eval'].includes(task)) return;
    if (ev.level === 'success' && (ev.title === 'Task finished' || ev.title.endsWith('finished'))) {
      trackResult(task, true, ev.message);
      onTaskCompleted(task);
    } else if (ev.level === 'error' && (ev.title === 'Task failed' || ev.title.endsWith('failed'))) {
      trackResult(task, false, ev.message);
    }
  });

  // Tick every 30s — finer-grained matching while still cheap.
  schedulerInterval = setInterval(tick, 30_000);
  setTimeout(tick, 5_000);
  logEvent('autopilot', 'Scheduler started', { category: 'system', message: 'tick interval 30s' });
}

export function stopScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = null;
  removeBusListener(SCHEDULER_BUS_NAME);
  schedulerStarted = false;
}

function tick(): void {
  try {
    const cfg = readConfig();
    if (!cfg.globalEnabled) return;
    const now = Date.now();
    const today = startOfTodayLocal();
    const nowDate = new Date(now);
    const hour = nowDate.getHours();
    const minute = nowDate.getMinutes();
    const weekday = nowDate.getDay();

    for (const s of cfg.schedules) {
      if (!s.enabled) continue;
      if (s.trigger.type !== 'daily') continue;
      const t = s.trigger;
      // Run if: hour matches, minute matches (within tick window), weekday allowed, and not already run today
      if (t.hour !== hour) continue;
      if (t.minute !== minute) continue;
      const days = t.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : t.weekdays;
      if (!days.includes(weekday)) continue;
      if (s.lastRunAt && s.lastRunAt >= today) continue;
      runTask(s);
    }
  } catch (e) {
    reportServerError('autopilot', 'Scheduler tick failed', e);
  }
}
