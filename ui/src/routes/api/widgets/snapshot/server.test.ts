/**
 * GET /api/widgets/snapshot -- unified iOS widget + Watch data feed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Job = {
  id: string;
  status: string;
  company?: string;
  role?: string;
  score?: number;
  geminiScore?: number;
  salary?: string;
  location?: string;
  source?: string;
  lastEvent?: number;
};

let jobs: Job[] = [];
let schedule: {
  jobId: string;
  scheduledAt: number;
  stage?: string;
  interviewers?: { name?: string }[];
}[] = [];
let issues: { id: string; severity: string; source: string; summary: string; ts: number }[] = [];

vi.mock('$lib/server/parsers', () => ({
  loadAllJobs: () => jobs,
}));

vi.mock('$lib/server/interview-schedule', () => ({
  listSchedule: () => schedule,
}));

vi.mock('$lib/server/issues', () => ({
  listOpenIssues: () => issues,
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
  issues = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/widgets/snapshot'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('gET /api/widgets/snapshot — fresh install', () => {
  it('returns ok + authenticated true + zeros across the board', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.authenticated).toBe(true);
    expect(r.body.stats).toEqual({ queued: 0, appliedToday: 0, upcomingInterviews: 0 });
    expect(r.body.nextInterview).toBeNull();
    expect(r.body.topApply).toBeNull();
    expect(r.body.openIssues).toEqual([]);
  });
});

describe('gET /api/widgets/snapshot — stats aggregates', () => {
  it('counts Queued + Applying as queued', async () => {
    jobs = [
      { id: 'a', status: 'Queued' },
      { id: 'b', status: 'Queued' },
      { id: 'c', status: 'Applying' },
      { id: 'd', status: 'Applied' },
    ];
    expect((await get()).body.stats.queued).toBe(3);
  });

  it('counts Applied with lastEvent today as appliedToday', async () => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    jobs = [
      { id: 'a', status: 'Applied', lastEvent: now },
      { id: 'b', status: 'Applied', lastEvent: startOfDay.getTime() - 60_000 }, // yesterday
      { id: 'c', status: 'Applied' }, // no lastEvent
    ];
    expect((await get()).body.stats.appliedToday).toBe(1);
  });

  it('counts upcoming interviews in next 7 days', async () => {
    const now = Date.now();
    schedule = [
      { jobId: 'j1', scheduledAt: now + 60_000 },
      { jobId: 'j2', scheduledAt: now + 6 * 24 * 60 * 60 * 1000 },
      { jobId: 'j3', scheduledAt: now + 8 * 24 * 60 * 60 * 1000 }, // > 7 days
      { jobId: 'j4', scheduledAt: now - 60_000 }, // past
    ];
    expect((await get()).body.stats.upcomingInterviews).toBe(2);
  });
});

describe('gET /api/widgets/snapshot — nextInterview', () => {
  it('returns null when no scheduled interviews', async () => {
    expect((await get()).body.nextInterview).toBeNull();
  });

  it('picks the earliest upcoming interview', async () => {
    const now = Date.now();
    schedule = [
      { jobId: 'j2', scheduledAt: now + 60 * 60 * 1000, stage: 'Onsite' },
      { jobId: 'j1', scheduledAt: now + 30 * 60 * 1000, stage: 'PhoneScreen' },
    ];
    jobs = [
      { id: 'j1', status: 'Interview', company: 'Acme', role: 'Engineer' },
      { id: 'j2', status: 'Interview', company: 'Beta', role: 'PM' },
    ];
    const r = await get();
    expect(r.body.nextInterview.jobId).toBe('j1');
    expect(r.body.nextInterview.company).toBe('Acme');
    expect(r.body.nextInterview.role).toBe('Engineer');
  });

  it('falls back to "Unknown company/role" when job catalog missing', async () => {
    schedule = [{ jobId: 'ghost', scheduledAt: Date.now() + 1000 }];
    const r = await get();
    expect(r.body.nextInterview.company).toBe('Unknown company');
    expect(r.body.nextInterview.role).toBe('Unknown role');
  });

  it('flattens interviewer name list, dropping anonymous entries', async () => {
    schedule = [
      {
        jobId: 'j1',
        scheduledAt: Date.now() + 1000,
        interviewers: [{ name: 'Alice' }, { name: '' }, {}, { name: 'Bob' }],
      },
    ];
    jobs = [{ id: 'j1', status: 'Interview', company: 'A', role: 'E' }];
    const r = await get();
    expect(r.body.nextInterview.interviewers).toEqual(['Alice', 'Bob']);
  });

  it('scheduledAt is ISO 8601', async () => {
    const ts = Date.now() + 1000;
    schedule = [{ jobId: 'j1', scheduledAt: ts }];
    jobs = [{ id: 'j1', status: 'Interview', company: 'A', role: 'E' }];
    const r = await get();
    expect(r.body.nextInterview.scheduledAt).toBe(new Date(ts).toISOString());
  });
});

describe('gET /api/widgets/snapshot — topApply', () => {
  it('returns null when no Queued/Scored jobs', async () => {
    jobs = [{ id: 'a', status: 'Applied' }];
    expect((await get()).body.topApply).toBeNull();
  });

  it('picks the highest-scoring Queued or Scored job', async () => {
    jobs = [
      { id: 'a', status: 'Queued', score: 4.0, company: 'A', role: 'r' },
      { id: 'b', status: 'Scored', score: 4.8, company: 'B', role: 'r' },
      { id: 'c', status: 'Queued', score: 3.9, company: 'C', role: 'r' },
    ];
    expect((await get()).body.topApply.jobId).toBe('b');
  });

  it('falls back to geminiScore when score is missing', async () => {
    jobs = [{ id: 'a', status: 'Queued', geminiScore: 4.5, company: 'A', role: 'r' }];
    expect((await get()).body.topApply.score).toBe(4.5);
  });
});

describe('gET /api/widgets/snapshot — openIssues', () => {
  it('returns up to 8 open issues with the compact shape', async () => {
    for (let i = 0; i < 10; i += 1) {
      issues.push({
        id: `i${i}`,
        severity: 'warn',
        source: 'liveness',
        summary: `broken ${i}`,
        ts: i,
      });
    }
    const r = await get();
    expect(r.body.openIssues.length).toBe(8);
    expect(r.body.openIssues[0]).toEqual({
      id: 'i0',
      severity: 'warn',
      source: 'liveness',
      summary: 'broken 0',
      ts: 0,
    });
  });

  it('normalises non-canonical severities to "info"', async () => {
    issues.push({
      id: 'x',
      severity: 'critical',
      source: 's',
      summary: 's',
      ts: 1,
    });
    const r = await get();
    expect(r.body.openIssues[0].severity).toBe('info');
  });
});
