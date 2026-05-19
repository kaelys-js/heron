/**
 * POST /api/onboarding/reset -- owner-only wizard reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isOwner = true;
const resetCalls: number[] = [];

vi.mock('$lib/server/auth-helpers', () => ({
  requireOwner: () => {
    if (!isOwner) {
      const err = new Error('forbidden') as Error & { status: number; body: unknown };
      err.status = 403;
      err.body = { message: 'forbidden', code: 'FORBIDDEN' };
      throw err;
    }
  },
}));

vi.mock('$lib/server/onboarding', () => ({
  reset: () => {
    resetCalls.push(Date.now());
    return { completedSteps: [], completed: false };
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  isOwner = true;
  resetCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post() {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/onboarding/reset'),
    request: new Request('http://localhost/api/onboarding/reset', { method: 'POST' }),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/onboarding/reset', () => {
  it('owner can reset', async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect(resetCalls.length).toBe(1);
    expect(r.body.state.completed).toBe(false);
  });

  it('non-owner gets 403', async () => {
    isOwner = false;
    const r = await post();
    expect(r.status).toBe(403);
    expect(resetCalls.length).toBe(0);
  });
});
