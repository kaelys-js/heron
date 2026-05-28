/**
 * GET /api/stats -- tray + widget polling endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Job = { status: string; lastEvent?: number };
let jobs: Job[] = [];
let schedule: { scheduledAt: number }[] = [];
let autopilot: { paused?: boolean } = {};

vi.mock('$lib/server/parsers', () => ({
  loadAllJobs: () => jobs,
}));

vi.mock('$lib/server/autopilot', () => ({
  readConfig: () => autopilot,
}));

vi.mock('$lib/server/interview-schedule', () => ({
  listSchedule: () => schedule,
}));

vi.mock('$lib/server/profiles', () => ({
  readProfiles: () => ({ activeId: 'default', profiles: [] }),
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  jobs = [];
  schedule = [];
  autopilot = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/stats'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('gET /api/stats — counters', () => {
  it('returns ok=true + all four counters when pipeline is empty', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body).toMatchObject({
      queued: 0,
      appliedToday: 0,
      upcomingInterviews: 0,
      autopilotPaused: false,
    });
  });

  it('counts Queued + Applying as queued', async () => {
    jobs = [
      { status: 'Queued' },
      { status: 'Queued' },
      { status: 'Applying' },
      { status: 'Applied' },
      { status: 'Rejected' },
    ];
    expect((await call()).body.queued).toBe(3);
  });

  it('counts Applied jobs with lastEvent >= today-start as appliedToday', async () => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    jobs = [
      { status: 'Applied', lastEvent: now }, // today
      { status: 'Applied', lastEvent: now - 60_000 }, // today (1 min ago)
      { status: 'Applied', lastEvent: startOfDay.getTime() - 60_000 }, // yesterday
      { status: 'Applied' }, // no lastEvent → not counted
    ];
    expect((await call()).body.appliedToday).toBe(2);
  });

  it('counts upcoming interviews within next 7 days', async () => {
    const now = Date.now();
    schedule = [
      { scheduledAt: now + 60_000 }, // 1 min from now → counts
      { scheduledAt: now + 6 * 24 * 60 * 60 * 1000 }, // 6 days → counts
      { scheduledAt: now + 8 * 24 * 60 * 60 * 1000 }, // 8 days → no
      { scheduledAt: now - 60_000 }, // past → no
    ];
    expect((await call()).body.upcomingInterviews).toBe(2);
  });

  it('autopilotPaused=true when readConfig().paused=true', async () => {
    autopilot = { paused: true };
    expect((await call()).body.autopilotPaused).toBe(true);
  });

  it('autopilotPaused=false when readConfig() returns {}', async () => {
    autopilot = {};
    expect((await call()).body.autopilotPaused).toBe(false);
  });

  it('returns 200 even when schedule store is empty (no crash)', async () => {
    schedule = [];
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.upcomingInterviews).toBe(0);
  });
});
