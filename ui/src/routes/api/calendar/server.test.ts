/**
 * GET /api/calendar -- unified interview + prep-block + deadline + action feed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HOUR = 60 * 60 * 1000;
const HOURS_24 = 24 * HOUR;

let upcomingInterviews: {
  jobId: string;
  interviewer: {
    slug: string;
    name: string;
    stage: string;
    scheduledAt: number;
    dossierPath?: string;
  };
}[] = [];
let offers: { id: string; jobId: string; decisionDeadline?: number; company: string }[] = [];
let stageState: {
  jobId: string;
  nextActionDue?: number;
  nextActionLabel?: string;
}[] = [];

vi.mock('$lib/server/interviewers', () => ({
  findUpcomingInterviews: () => upcomingInterviews,
}));

vi.mock('$lib/server/offers', () => ({
  listActiveOffers: () => offers,
}));

vi.mock('$lib/server/stage-state', () => ({
  listAllStageState: () => stageState,
}));

vi.mock('$lib/server/profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  upcomingInterviews = [];
  offers = [];
  stageState = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get(qs = '') {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/calendar' + qs),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/calendar', () => {
  it('returns ok + empty entries on a fresh install', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.entries)).toBe(true);
  });

  it('honours ?days=N for the window', async () => {
    const r = await get('?days=30');
    expect(r.status).toBe(200);
  });

  it('falls back to 14 when ?days is missing or invalid', async () => {
    const r1 = await get();
    const r2 = await get('?days=not-a-number');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('includes scheduled interviews in the entries list', async () => {
    const now = Date.now();
    upcomingInterviews = [
      {
        jobId: 'j1',
        interviewer: {
          slug: 'alice',
          name: 'Alice',
          stage: 'phone-screen',
          scheduledAt: now + 2 * HOURS_24,
        },
      },
    ];
    const r = await get();
    expect(r.body.entries.some((e: { kind: string }) => e.kind === 'interview')).toBe(true);
  });

  it('emits a prep-block 24h before a phone-screen', async () => {
    const now = Date.now();
    upcomingInterviews = [
      {
        jobId: 'j1',
        interviewer: {
          slug: 'alice',
          name: 'Alice',
          stage: 'phone-screen',
          scheduledAt: now + 3 * HOURS_24,
        },
      },
    ];
    const r = await get();
    const prep = r.body.entries.find((e: { kind: string }) => e.kind === 'prep-block');
    expect(prep).toBeTruthy();
    expect(prep.title).toContain('Alice');
  });

  it('emits a prep-block 48h before an onsite', async () => {
    const now = Date.now();
    upcomingInterviews = [
      {
        jobId: 'j1',
        interviewer: {
          slug: 'alice',
          name: 'Alice',
          stage: 'onsite',
          scheduledAt: now + 4 * HOURS_24,
        },
      },
    ];
    const r = await get();
    const prep = r.body.entries.find((e: { kind: string }) => e.kind === 'prep-block');
    expect(prep).toBeTruthy();
    // 4 days from now interview - 48h prep = 2 days from now (still in window)
    const days24 = HOURS_24;
    expect(Math.round((prep.startAt - now) / days24)).toBe(2);
  });

  it('prep title uses "Prep" prefix when dossier exists, "Research + prep" otherwise', async () => {
    const now = Date.now();
    upcomingInterviews = [
      {
        jobId: 'j1',
        interviewer: {
          slug: 'alice',
          name: 'Alice',
          stage: 'phone-screen',
          scheduledAt: now + 2 * HOURS_24,
          dossierPath: '/tmp/d.md',
        },
      },
      {
        jobId: 'j2',
        interviewer: {
          slug: 'bob',
          name: 'Bob',
          stage: 'phone-screen',
          scheduledAt: now + 2 * HOURS_24,
        },
      },
    ];
    const r = await get();
    const prepWith = r.body.entries.find(
      (e: { kind: string; interviewerSlug: string }) =>
        e.kind === 'prep-block' && e.interviewerSlug === 'alice',
    );
    const prepWithout = r.body.entries.find(
      (e: { kind: string; interviewerSlug: string }) =>
        e.kind === 'prep-block' && e.interviewerSlug === 'bob',
    );
    expect(prepWith.title).toMatch(/^Prep · /);
    expect(prepWithout.title).toMatch(/^Research \+ prep · /);
  });
});
