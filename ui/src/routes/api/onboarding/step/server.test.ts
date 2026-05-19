/**
 * POST /api/onboarding/step -- wizard step transitions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completeCalls: string[] = [];
const skipCalls: string[] = [];

vi.mock('$lib/server/onboarding', () => ({
  STEPS: ['welcome', 'cv', 'profile', 'portals', 'ready'],
  markStepComplete: (step: string) => {
    completeCalls.push(step);
    return { current: step, complete: true };
  },
  markStepSkipped: (step: string) => {
    skipCalls.push(step);
    return { current: step, skipped: true };
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  completeCalls.length = 0;
  skipCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/onboarding/step'),
    request: new Request('http://localhost/api/onboarding/step', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/onboarding/step', () => {
  it('400 when step is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when step is unknown', async () => {
    const r = await post({ step: 'imaginary' });
    expect(r.status).toBe(400);
  });

  it('marks step complete by default', async () => {
    const r = await post({ step: 'cv' });
    expect(r.status).toBe(200);
    expect(completeCalls).toEqual(['cv']);
    expect(skipCalls).toEqual([]);
  });

  it('marks step skipped when action=skipped', async () => {
    const r = await post({ step: 'portals', action: 'skipped' });
    expect(r.status).toBe(200);
    expect(skipCalls).toEqual(['portals']);
    expect(completeCalls).toEqual([]);
  });

  it('falls back to "complete" when action is anything else', async () => {
    const r = await post({ step: 'cv', action: 'cancel' });
    expect(r.status).toBe(200);
    expect(completeCalls).toEqual(['cv']);
  });

  it('returns the state from onboarding helper', async () => {
    const r = await post({ step: 'cv' });
    expect(r.body.state.current).toBe('cv');
    expect(r.body.state.complete).toBe(true);
  });
});
