/**
 * Autopilot -- recurring + event-triggered task schedules.
 *
 * Config lives in `data/autopilot.json` and is the source of truth.
 * The scheduler runs in-process while the dashboard is up; this is documented
 * in the UI so users aren't surprised by it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installBusListener, logEvent, reportServerError } from './events';
import { listRunning, runScan, runGemini, runLinkedInApply, runAutoEval } from './orchestrator';
import type { ActivityEvent } from '$lib/types';
import {
  get as getJob,
  runById as runJobById,
  list as listJobs,
  isRunning as isJobRunning,
} from './jobs';
import { readLastRun, writeLastRun } from './job-last-run';
import { userSharedPathForUser } from './profile-paths';
import {
  currentUserIdOrDefault,
  listSchedulableUsers,
  runAsUser,
  SYSTEM_USER_ID,
} from './user-context';

/** Per-user autopilot config path. Always explicit-userId -- the implicit
 *  variant was removed (F9) because every caller after the per-user
 *  cache migration knows which user it's targeting; defaulting silently
 *  to the active user was the bug that caused user A's writes to land
 *  in user B's file inside the scheduler tick. */
function configPathForUser(userId: string): string {
  return userSharedPathForUser(userId, 'autopilot');
}

/** Task name -- any registered job id. The legacy literal union is kept as
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
export type WeeklyTrigger = {
  type: 'weekly';
  /** 0=Sunday, 6=Saturday. */
  dayOfWeek: number;
  hour: number;
  minute: number;
};
export type AfterTrigger = {
  type: 'after';
  /** Source task id this schedule fires after. Any registered job id is OK. */
  task: TaskName;
};
export type Trigger = DailyTrigger | WeeklyTrigger | AfterTrigger;

export type Schedule = {
  id: ScheduleId;
  /** Display name shown in UI */
  name: string;
  /** One-sentence description shown in UI */
  description: string;
  /** Multi-line "what this actually does" -- shown in the expandable detail panel */
  details: string[];
  /** Visible label on the linked task (icon legend) */
  taskLabel: string;
  task: TaskName;
  enabled: boolean;
  trigger: Trigger;
  args?: Record<string, unknown>;
  /** P2: Scope this schedule to a single profile by slug. When set, the
   *  scheduler fires the task with `--profile <slug>` instead of fanning
   *  out across every profile. Leave unset for global (multi-profile
   *  fan-out for scan/gemini, active-profile for everything else). */
  profileId?: string;
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
    /** Auto-eval batch is capped at this many evaluate runs per fire. Each
     *  run costs ~$0.30-$1.00 of Claude usage, so a low cap is a real
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
        "Runs scan-broad.py against LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs, The Muse, RemoteOK, We Work Remotely, HN Who's Hiring, and (if keys set) Adzuna.",
        'Title-filtered against your archetype — drops obvious mismatches before they hit the pipeline.',
        "Dedupes against scan-history.tsv so the same posting isn't re-added.",
        'Typical run: 3–5 minutes, finds 30–80 new postings.',
      ],
      taskLabel: 'scripts/scan/scan-broad.py',
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
        "Skipped automatically if GEMINI_API_KEY isn't set.",
      ],
      taskLabel: 'scripts/scan/gemini-first-pass.py',
      task: 'gemini',
      enabled: true,
      trigger: { type: 'after', task: 'scan' },
      args: { top: 30 },
    },
    {
      id: 'auto-eval-after-gemini',
      name: 'Auto deep-eval high-fit jobs',
      description:
        'After Gemini scoring, run a deep Claude evaluation + generate a tailored CV PDF for every job scoring ≥ Auto-evaluate score.',
      details: [
        'Triggers after every successful gemini-first-pass.py run.',
        'Picks up to N jobs (Max auto-evals / run) sorted by Gemini score, descending.',
        'Each evaluate run takes 1–3 min and costs ~$0.30–$1.00 in Claude usage.',
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
      name: 'Weekday apply-queue drain',
      description:
        'Drain the Queued apply queue on weekdays — runs the right portal adapter per job.',
      details: [
        'Iterates jobs whose status is Queued, sorted by score (highest first).',
        'For each job: detects portal (LinkedIn / Greenhouse / Ashby production; others ManualApplyNeeded), regenerates CV + cover letter if missing, then dispatches apply-portal.py.',
        'Honors profile.automation.autonomous_apply per profile — jobs from a profile with autopilot OFF stay Queued for manual review.',
        'Stops as soon as today\'s applied count hits "Max applies / day". During the warmup window (first N days after enabling autonomous_apply) the per-profile cap is clamped to 5.',
        'Soft-failures (CAPTCHA, anti-bot, unknown form field) surface as Issues in the Inbox with a "Open posting" CTA so you can finish by hand.',
      ],
      taskLabel: 'apply-queue-drain',
      task: 'apply-queue-drain',
      enabled: false,
      trigger: { type: 'daily', hour: 10, minute: 30, weekdays: [1, 2, 3, 4, 5] },
    },
    {
      id: 'daily-backup',
      name: 'Daily backup',
      description: 'Snapshot user data to data/backups/ every night at 02:00.',
      details: [
        'Tarballs every profile dir (cv.md, profile.yml, applications.md, reports/, output/, interview-prep/) + shared infra (autopilot.json, profiles.json, issues.jsonl, story-bank.md) into data/backups/{ISO}.tar.gz.',
        'Excludes .env, node_modules, .playwright-* sessions, data/apply-state — credentials + transient state stay out of backups.',
        'Prunes anything older than the retention setting (default 14 days). The most recent backup is always kept regardless of age.',
        'Manual trigger via /settings → Backups → "Back up now". Restore + delete also live there.',
        'On by default — losing your applications tracker after weeks of work is the biggest data-loss risk.',
      ],
      taskLabel: 'daily-backup',
      task: 'daily-backup',
      enabled: true,
      trigger: { type: 'daily', hour: 2, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    },
    {
      id: 'morning-digest',
      name: 'Morning digest',
      description:
        'Once-per-day 07:00 rollup so you know what to focus on today without opening the dashboard.',
      details: [
        'Aggregates the last 24h of activity: applications fired, queued jobs, interview-stage transitions, offers, rejections, follow-ups due, new pattern recommendations.',
        'Emits a single info-level activity event with a one-liner summary; the bell shows it.',
        'Pairs with OS-level Notifications (enable on /settings) so the digest fires as a desktop ping even when the dashboard tab is in the background.',
        'On by default — the daily focus list is the biggest "should I open the dashboard?" decision-maker.',
      ],
      taskLabel: 'daily-digest',
      task: 'daily-digest',
      enabled: true,
      trigger: { type: 'daily', hour: 7, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    },
  ],
  thresholds: {
    autoEvaluateScore: 4.0,
    maxAutoEvalsPerRun: 10,
    maxAppliesPerDay: 30,
  },
};

/**
 * Per-user config cache (F9). Pre-F9 this was a single module-level
 * `let cached: AutopilotConfig | null = null` -- the FIRST request to
 * populate it won for everyone, and `writeConfig` poisoned the cache
 * across users. Now keyed by `currentUserIdOrDefault()` so:
 *
 *   - Each user's read populates their own slot from their own file
 *   - A write only invalidates the writing user's slot
 *   - The scheduler tick (F10) iterates `listSchedulableUsers()` and
 *     each user gets a fresh read from their own slot
 *
 * Cache invalidation: there is none; the file is small JSON, every
 * read goes to disk if the slot is empty, and writes are explicit. If
 * a future need for cross-process invalidation arises (multiple
 * SvelteKit replicas), drop the cache entirely -- disk reads are ~1ms.
 */
const cache = new Map<string, AutopilotConfig>();

export function readConfig(): AutopilotConfig {
  return readConfigForUser(currentUserIdOrDefault());
}

export function readConfigForUser(userId: string): AutopilotConfig {
  const hit = cache.get(userId);
  if (hit) return hit;
  try {
    const p = configPathForUser(userId);
    if (!fs.existsSync(p)) {
      writeConfigForUser(userId, DEFAULT_CONFIG);
      cache.set(userId, DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AutopilotConfig>;
    const merged = mergeWithDefaults(parsed);
    cache.set(userId, merged);
    return merged;
  } catch (e) {
    reportServerError('autopilot', 'Failed to read config — falling back to defaults', e, {
      userId: userId === SYSTEM_USER_ID ? null : userId,
    });
    cache.set(userId, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
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
  writeConfigForUser(currentUserIdOrDefault(), next);
}

export function writeConfigForUser(userId: string, next: AutopilotConfig): void {
  const p = configPathForUser(userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2) + '\n');
  cache.set(userId, next);
}

export function patchConfig(patch: Partial<AutopilotConfig>): AutopilotConfig {
  return patchConfigForUser(currentUserIdOrDefault(), patch);
}

export function patchConfigForUser(
  userId: string,
  patch: Partial<AutopilotConfig>,
): AutopilotConfig {
  const current = readConfigForUser(userId);
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
  writeConfigForUser(userId, next);
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

function nextMatchTimestampWeekly(t: WeeklyTrigger, from: number = Date.now()): number {
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(t.hour, t.minute, 0, 0);
    if (d.getTime() <= from) continue;
    if (d.getDay() !== t.dayOfWeek) continue;
    return d.getTime();
  }
  return from + 7 * 24 * 60 * 60 * 1000;
}

export function nextRunAt(s: Schedule): number | null {
  if (!s.enabled) return null;
  if (s.trigger.type === 'daily') return nextMatchTimestamp(s.trigger);
  if (s.trigger.type === 'weekly') return nextMatchTimestampWeekly(s.trigger);
  return null;
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

  // Pluggable path: any registered job (the legacy 3 + every hygiene /
  // discovery / insight / apply / maintenance job) can be invoked by id.
  // Falls back to the legacy direct calls only if the registry hasn't
  // been installed yet (boot race).
  const def = getJob(s.task);
  if (def) {
    await runJobById(s.task, s.args ?? {});
    return;
  }
  switch (s.task) {
    case 'scan':
      // P1: default daily-scan fans out across every profile of the
      // CURRENT user sequentially so a 2-profile install gets scanned
      // for BOTH career tracks per run, not just the active one.
      // Explicit `s.profileId` overrides. The cross-USER fan-out
      // happens in tick() now (F10).
      if (s.profileId) {
        runScan(s.profileId);
      } else {
        runScanForCurrentUsersProfiles();
      }
      break;
    case 'gemini':
      if (s.profileId) {
        runGemini((s.args?.top as number) ?? 30, s.profileId);
      } else {
        runGeminiForCurrentUsersProfiles((s.args?.top as number) ?? 30);
      }
      break;
    case 'apply-linkedin':
      runLinkedInApply(false, undefined, s.profileId);
      break;
    case 'auto-eval':
      // Fire-and-forget -- runAutoEval emits its own batch start/finish
      // events on the activity bus, and the scheduler's bus listener picks
      // those up to update lastRunResult. We don't await here because the
      // batch can run for up to an hour.
      runAutoEval(s.profileId).catch((err) => {
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

/**
 * Fan out a daily-scan run across the CURRENT user's profiles
 * sequentially. Sequential because the underlying Python scrapers share
 * rate limits + Playwright resources -- running them in parallel for
 * multiple profiles would just fight each other.
 *
 * F10: pre-fix this also iterated `listSchedulableUsers()` itself,
 * which double-fanned-out when the tick() loop (now per-user) called
 * it. The user-level loop now lives in tick() so this helper only
 * handles profile-level fan-out within the current user.
 */
async function runScanForCurrentUsersProfiles(): Promise<void> {
  try {
    const { listProfilesForUser } = await import('./profiles-db');
    const userId = currentUserIdOrDefault();
    const profiles = listProfilesForUser(userId);
    if (profiles.length === 0) {
      runScan();
      return;
    }
    for (const p of profiles) {
      logEvent('autopilot', 'Daily scan for profile ' + p.slug, {
        category: 'system',
        message: 'fan-out · profile=' + p.slug,
      });
      runScan(p.slug);
    }
  } catch (e) {
    reportServerError('autopilot', 'Fan-out scan failed', e);
    // Best-effort fallback to the active-profile path.
    runScan();
  }
}

async function runGeminiForCurrentUsersProfiles(top: number): Promise<void> {
  try {
    const { listProfilesForUser } = await import('./profiles-db');
    const userId = currentUserIdOrDefault();
    const profiles = listProfilesForUser(userId);
    if (profiles.length === 0) {
      runGemini(top);
      return;
    }
    for (const p of profiles) {
      logEvent('autopilot', 'Gemini for profile ' + p.slug, {
        category: 'system',
        message: 'fan-out · profile=' + p.slug + ' · top=' + top,
      });
      runGemini(top, p.slug);
    }
  } catch (e) {
    reportServerError('autopilot', 'Fan-out gemini failed', e);
    runGemini(top);
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
    return {
      ok: false,
      message: 'This schedule runs only when its trigger event fires (' + s.trigger.task + ').',
    };
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
      logEvent('autopilot', 'After-trigger: ' + s.name, {
        category: 'system',
        message: 'after ' + task,
      });
      runTask(s);
    }
  }
}

/** Update lastRunResult when a task finishes (regardless of who triggered it).
 *  Touches both `cfg.schedules` (legacy / user-configured) AND
 *  `data/job-last-run.json` (registry-declared) so the /autopilot page
 *  shows the right state regardless of which path triggered the run. */
function trackResult(task: TaskName, success: boolean, message?: string): void {
  // Legacy / user-configured schedules -- update the matching cfg entries.
  const cfg = readConfig();
  let dirty = false;
  const next = cfg.schedules.map((s) => {
    if (s.task !== task) return s;
    if (s.lastRunResult !== 'started') return s;
    dirty = true;
    return {
      ...s,
      lastRunResult: (success ? 'success' : 'failure') as 'success' | 'failure',
      lastRunMessage: message,
    };
  });
  if (dirty) writeConfig({ ...cfg, schedules: next });

  // Registry-declared schedules -- update job-last-run.json. Only flip from
  // 'started' to a terminal state so a manual run doesn't clobber a
  // scheduler-driven success that already landed.
  const last = readLastRun(task);
  if (last && last.lastRunResult === 'started') {
    writeLastRun(task, {
      lastRunAt: Date.now(),
      lastRunResult: success ? 'success' : 'failure',
      lastRunMessage: message,
    });
  }
}

let schedulerStarted = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const SCHEDULER_BUS_NAME = 'autopilot/scheduler-task-tracker';

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Subscribe to task lifecycle events on the bus (avoids a circular import with orchestrator).
  // installBusListener is HMR-idempotent -- see events.ts.
  installBusListener(SCHEDULER_BUS_NAME, (ev: ActivityEvent) => {
    if (ev.category !== 'task' && ev.category !== 'system') return;
    const task = ev.source as TaskName;
    // Accept any registered job id OR the 4 legacy task ids. Filtering by
    // an open-ended allowlist is what makes registry-declared schedules
    // get their lastRunResult updated automatically -- previously only the
    // 4 hardcoded ids passed this gate.
    const isLegacy = ['scan', 'gemini', 'apply-linkedin', 'auto-eval'].includes(task);
    const isRegistered = !!getJob(task);
    if (!isLegacy && !isRegistered) return;
    // F10 -- scope the trackResult + after-trigger lookup to ev.userId
    // (if present). Both `trackResult` and `onTaskCompleted` call
    // `readConfig()` / `writeConfig()` which are now per-user. Without
    // this wrap, every status update would land in SYSTEM_USER's file.
    const handle = (): void => {
      if (
        ev.level === 'success' &&
        (ev.title === 'Task finished' || ev.title.endsWith('finished'))
      ) {
        trackResult(task, true, ev.message);
        onTaskCompleted(task);
      } else if (
        ev.level === 'error' &&
        (ev.title === 'Task failed' || ev.title.endsWith('failed'))
      ) {
        trackResult(task, false, ev.message);
      }
    };
    if (ev.userId) {
      void runAsUser(ev.userId, async () => handle());
    } else {
      // Broadcast / system event -- fall back to SYSTEM_USER. Logged at
      // info level (not warn) because legitimate system events do hit
      // this path (boot, cleanup, etc.).
      handle();
    }
  });

  // Tick every 30s -- finer-grained matching while still cheap.
  // We wrap tick() to handle its async signature (the per-user fan-out
  // landed in F10 makes tick a Promise-returning function).
  schedulerInterval = setInterval(() => {
    void tick().catch((e) => {
      reportServerError('autopilot', 'Scheduler tick failed', e);
    });
  }, 30_000);
  setTimeout(() => {
    void tick().catch((e) => {
      reportServerError('autopilot', 'Scheduler tick failed', e);
    });
  }, 5_000);
  logEvent('autopilot', 'Scheduler started', { category: 'system', message: 'tick interval 30s' });
}

// D17 -- `stopScheduler` removed: scheduler lives for the dashboard's
// lifetime; HMR resets the schedulerStarted flag implicitly. removeBusListener
// goes with it (D22) since it had no other caller.

/**
 * F10 -- Per-tick user fan-out. The 30s setInterval runs OUTSIDE any
 * user ALS context. Pre-F10 this meant readConfig() resolved to
 * SYSTEM_USER and only legacy data/profiles/_shared/autopilot.json was
 * ever consulted -- real users' schedules + globalEnabled flags were
 * dead code.
 *
 * Now: enumerate every schedulable user, run the per-user tick body
 * inside `runAsUser(userId, …)` so:
 *   - readConfig() reads THAT user's autopilot.json (F9)
 *   - readLastRun() reads THAT user's job-last-run.json (F10 sibling)
 *   - runTask() / runRegistryJob() spawn under THAT user's context
 *     (orchestrator's CAREER_OPS_USER_ID env injection covers the
 *     child process)
 *   - runJobById() detects the existing user context and runs once
 *     for THIS user only (registry.ts:104-108) -- no double fan-out
 */
async function tick(): Promise<void> {
  const userIds = await listSchedulableUsers();
  for (const userId of userIds) {
    await runAsUser(userId, async () => tickForCurrentUser());
  }
}

/** Per-user tick body. Caller MUST establish the ALS user context. */
function tickForCurrentUser(): void {
  try {
    const cfg = readConfig();
    if (!cfg.globalEnabled) return;
    const now = Date.now();
    const today = startOfTodayLocal();
    const nowDate = new Date(now);
    const hour = nowDate.getHours();
    const minute = nowDate.getMinutes();
    const weekday = nowDate.getDay();

    // (1) User-configured / legacy schedules -- same logic as before, plus
    //     a `weekly` branch.
    const userTaskIds = new Set<string>();
    for (const s of cfg.schedules) {
      userTaskIds.add(s.task);
      if (!s.enabled) continue;
      const t = s.trigger;
      if (t.type === 'daily') {
        if (t.hour !== hour) continue;
        if (t.minute !== minute) continue;
        const days = t.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : t.weekdays;
        if (!days.includes(weekday)) continue;
        if (s.lastRunAt && s.lastRunAt >= today) continue;
        runTask(s);
      } else if (t.type === 'weekly') {
        if (t.dayOfWeek !== weekday) continue;
        if (t.hour !== hour) continue;
        if (t.minute !== minute) continue;
        if (s.lastRunAt && s.lastRunAt >= today) continue;
        runTask(s);
      }
      // 'after' triggers fire from onTaskCompleted, not from tick.
    }

    // (2) Registry-declared schedules -- every JobDef whose trigger is
    //     daily/weekly gets fired automatically here if the user hasn't
    //     overridden it via a cfg.schedules entry. State lives in the
    //     per-user `data/users/{uid}/profiles/_shared/job-last-run.json`
    //     (see job-last-run.ts).
    for (const def of listJobs()) {
      if (!def.allowManual) continue; // skip pure after-event chains
      if (userTaskIds.has(def.id)) continue; // user override wins
      const t = def.trigger;
      if (t.type === 'daily') {
        if (t.hour !== hour) continue;
        if (t.minute !== minute) continue;
        const days = !t.weekdays || t.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : t.weekdays;
        if (!days.includes(weekday)) continue;
      } else if (t.type === 'weekly') {
        if (t.dayOfWeek !== weekday) continue;
        if (t.hour !== hour) continue;
        if (t.minute !== minute) continue;
      } else {
        continue; // manual or after — not driven by the clock
      }
      const last = readLastRun(def.id);
      if (last && last.lastRunAt >= today) continue; // already fired today
      if (isJobRunning(def.id)) continue; // in-flight dedupe
      runRegistryJob(def.id, def.label);
    }
  } catch (e) {
    reportServerError('autopilot', 'Scheduler tick failed', e);
  }
}

/** Fire a registry-declared job and record its result in JobLastRun. */
function runRegistryJob(id: string, label: string): void {
  logEvent('autopilot', 'Triggering ' + label, { category: 'system', message: 'task=' + id });
  writeLastRun(id, { lastRunAt: Date.now(), lastRunResult: 'started' });
  runJobById(id)
    .then((r) => {
      writeLastRun(id, {
        lastRunAt: Date.now(),
        lastRunResult: r.ok ? 'success' : 'failure',
        lastRunMessage: r.ok ? r.message : r.error,
      });
    })
    .catch((err) => {
      writeLastRun(id, {
        lastRunAt: Date.now(),
        lastRunResult: 'failure',
        lastRunMessage: err instanceof Error ? err.message : String(err),
      });
      reportServerError('autopilot', 'Registry job ' + id + ' threw', err, { category: 'system' });
    });
}
