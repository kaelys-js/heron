/**
 * POST /api/autopilot/resume -- re-enable autopilot after circuit-breaker trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockResult: { ok: boolean; cleared?: number; message?: string } = {
  ok: true,
  cleared: 1,
};
const resumeCalls: number[] = [];

vi.mock('$lib/server/autopilot-circuit-breaker', () => ({
  resumeAutopilot: () => {
    resumeCalls.push(Date.now());
    return mockResult;
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  mockResult = { ok: true, cleared: 1 };
  resumeCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post() {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/autopilot/resume'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/autopilot/resume', () => {
  it('passes through the resumeAutopilot result envelope', async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.cleared).toBe(1);
    expect(resumeCalls.length).toBe(1);
  });

  it('passes through ok=false from the circuit breaker', async () => {
    mockResult = { ok: false, message: 'nothing to resume' };
    const r = await post();
    // wrap doesn't translate ok=false to non-2xx -- that's by design;
    // resumeAutopilot reports cleared=0 with ok=false when there was no
    // open circuit.
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toBe('nothing to resume');
  });
});
