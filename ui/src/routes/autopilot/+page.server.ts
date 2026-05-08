import { readConfig, nextRunAt } from '$lib/server/autopilot';
import { bus } from '$lib/server/events';
import type { ActivityEvent } from '$lib/types';

const HISTORY_SOURCES = ['scan', 'gemini', 'apply-linkedin', 'autopilot'];

export async function load() {
  const config = readConfig();
  const next = config.schedules.reduce<Record<string, number | null>>((acc, s) => {
    acc[s.id] = nextRunAt(s);
    return acc;
  }, {});
  const history: ActivityEvent[] = bus
    .recent()
    .filter((ev) => HISTORY_SOURCES.includes(ev.source) && (ev.category === 'task' || ev.category === 'system'))
    .slice(-50)
    .reverse();
  return { config, nextRunByScheduleId: next, history };
}
