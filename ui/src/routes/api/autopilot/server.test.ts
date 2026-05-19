/**
 * GET + POST /api/autopilot -- autopilot schedule config.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stored = { schedules: [{ id: 's1', enabled: true }] };

vi.mock('$lib/server/autopilot', () => ({
  readConfig: () => stored,
  patchConfig: (patch: Record<string, unknown>) => {
    stored = { ...stored, ...patch } as typeof stored;
    return stored;
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { GET, POST } = await import('./+server');

beforeEach(() => {
  stored = { schedules: [{ id: 's1', enabled: true }] };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/autopilot'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/autopilot'),
    request: new Request('http://localhost/api/autopilot', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/autopilot', () => {
  it('returns the current config', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.schedules.length).toBe(1);
  });
});

describe('POST /api/autopilot', () => {
  it('400 when body is null', async () => {
    const r = await post('null');
    expect(r.status).toBe(400);
  });

  it('400 when body is a string', async () => {
    const r = await post('"x"');
    expect(r.status).toBe(400);
  });

  it('400 when body is not valid JSON', async () => {
    const r = await post('not-json');
    expect(r.status).toBe(400);
  });

  it('patches the config + returns the new shape', async () => {
    const r = await post({ schedules: [{ id: 's1', enabled: false }] });
    expect(r.status).toBe(200);
    expect(r.body.config.schedules[0].enabled).toBe(false);
  });
});
