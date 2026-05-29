/**
 * GET /api/funnel -- conversion-rate funnel stats.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockStats = {
  applied: 0,
  screened: 0,
  interview: 0,
  offer: 0,
  accepted: 0,
  appliedToScreen: 1,
  screenToInterview: 1,
  interviewToOffer: 1,
  offerToAccept: 1,
};

vi.mock('$lib/server/stage-state', () => ({
  computeFunnelStats: () => mockStats,
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
  mockStats = {
    applied: 0,
    screened: 0,
    interview: 0,
    offer: 0,
    accepted: 0,
    appliedToScreen: 1,
    screenToInterview: 1,
    interviewToOffer: 1,
    offerToAccept: 1,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/funnel'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('gET /api/funnel', () => {
  it('returns funnel stats + ok=true', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.funnel).toBeDefined();
  });

  it('leakiestStage is null when no rate is between 0 and 1', async () => {
    mockStats.appliedToScreen = 1;
    mockStats.screenToInterview = 1;
    mockStats.interviewToOffer = 1;
    mockStats.offerToAccept = 1;
    const r = await get();
    expect(r.body.leakiestStage).toBeNull();
  });

  it('leakiestStage is the smallest non-zero conversion rate', async () => {
    mockStats.appliedToScreen = 0.5;
    mockStats.screenToInterview = 0.2;
    mockStats.interviewToOffer = 0.8;
    mockStats.offerToAccept = 0.9;
    const r = await get();
    expect(r.body.leakiestStage).toBe('screen→interview');
  });

  it('ignores rates equal to 0 (no data yet)', async () => {
    mockStats.appliedToScreen = 0;
    mockStats.screenToInterview = 0.5;
    mockStats.interviewToOffer = 0.8;
    mockStats.offerToAccept = 0.9;
    const r = await get();
    // 0 is filtered out -- leakiest is 0.5 (screen→interview)
    expect(r.body.leakiestStage).toBe('screen→interview');
  });

  it('returns the generic "Not enough data" advice when no leaky stage', async () => {
    const r = await get();
    expect(r.body.advice).toContain('Not enough data');
  });

  it('returns stage-specific advice for applied→screen leak', async () => {
    mockStats.appliedToScreen = 0.1;
    mockStats.screenToInterview = 0.9;
    mockStats.interviewToOffer = 0.9;
    mockStats.offerToAccept = 0.9;
    const r = await get();
    expect(r.body.leakiestStage).toBe('applied→screen');
    expect(r.body.advice).toContain('pre-screen');
  });

  it('advice for interview→offer leak references hiring-bar', async () => {
    mockStats.appliedToScreen = 0.9;
    mockStats.screenToInterview = 0.9;
    mockStats.interviewToOffer = 0.1;
    mockStats.offerToAccept = 0.9;
    const r = await get();
    expect(r.body.leakiestStage).toBe('interview→offer');
    expect(r.body.advice).toMatch(/hiring-bar|loops|format/);
  });
});
