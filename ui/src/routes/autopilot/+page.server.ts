import { readConfig, nextRunAt, type Schedule } from '$lib/server/autopilot';
import { bus } from '$lib/server/events';
import { listSummaries } from '$lib/server/jobs';
import { readLastRun } from '$lib/server/job-last-run';
import type { ActivityEvent } from '$lib/types';

const HISTORY_SOURCES = ['scan', 'gemini', 'apply-linkedin', 'autopilot'];

/**
 * Synthesize a `Schedule` from a registry-declared `JobSummary` so the
 * existing autopilot UI can render registry jobs alongside user-configured
 * schedules. Virtual schedules use the `auto:<jobId>` id prefix; lastRun
 * state is joined from `data/job-last-run.json`.
 */
function virtualSchedules(): Schedule[] {
  const summaries = listSummaries();
  const out: Schedule[] = [];
  for (const s of summaries) {
    if (!s.allowManual) continue;
    const t = s.trigger;
    if (t.type !== 'daily' && t.type !== 'weekly') continue;
    const last = readLastRun(s.id);
    const triggerForSchedule =
      t.type === 'daily'
        ? { type: 'daily' as const, hour: t.hour, minute: t.minute, weekdays: t.weekdays ?? [] }
        : { type: 'weekly' as const, dayOfWeek: t.dayOfWeek, hour: t.hour, minute: t.minute };
    out.push({
      id: 'auto:' + s.id,
      name: s.label,
      description: s.description,
      details: [s.description],
      taskLabel: s.id,
      task: s.id,
      enabled: true,
      trigger: triggerForSchedule,
      lastRunAt: last?.lastRunAt,
      lastRunResult: last?.lastRunResult,
      lastRunMessage: last?.lastRunMessage,
    });
  }
  return out;
}

export async function load() {
  const config = readConfig();
  // Merge user-configured schedules with registry-synthesized ones, skipping
  // any synthetic entry whose taskId is already owned by a user schedule.
  const userTaskIds = new Set(config.schedules.map((s) => s.task));
  const synthetic = virtualSchedules().filter((s) => !userTaskIds.has(s.task));
  const allSchedules = [...config.schedules, ...synthetic];
  const next = allSchedules.reduce<Record<string, number | null>>((acc, s) => {
    acc[s.id] = nextRunAt(s);
    return acc;
  }, {});
  const history: ActivityEvent[] = bus
    .recent()
    .filter(
      (ev) =>
        HISTORY_SOURCES.includes(ev.source) && (ev.category === 'task' || ev.category === 'system'),
    )
    .slice(-50)
    .reverse();
  return {
    config: { ...config, schedules: allSchedules },
    nextRunByScheduleId: next,
    history,
    syntheticCount: synthetic.length,
  };
}
