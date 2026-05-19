/**
 * POST /api/autopilot/run -- manual schedule trigger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runCalls: string[] = [];
let mockResult: { ok: boolean; message?: string } = { ok: true, message: 'started' };

vi.mock('$lib/server/autopilot', () => ({
  runScheduleNow: (id: string) => {
    runCalls.push(id);
    return mockResult;
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  runCalls.length = 0;
  mockResult = { ok: true, message: 'started' };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/autopilot/run'),
    request: new Request('http://localhost/api/autopilot/run', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/autopilot/run', () => {
  it('400 when id is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when id is not in the VALID_IDS allow-list', async () => {
    const r = await post({ id: 'imaginary-schedule' });
    expect(r.status).toBe(400);
  });

  it('400 when body is malformed JSON', async () => {
    const r = await post('not-json');
    expect(r.status).toBe(400);
  });

  it.each([
    'daily-scan',
    'auto-gemini-after-scan',
    'weekday-apply',
  ])('accepts valid id "%s"', async (id) => {
    const r = await post({ id });
    expect(r.status).toBe(200);
    expect(runCalls).toEqual([id]);
  });

  it('400 when runScheduleNow returns ok=false', async () => {
    mockResult = { ok: false, message: 'cron busy' };
    const r = await post({ id: 'daily-scan' });
    expect(r.status).toBe(400);
  });
});
