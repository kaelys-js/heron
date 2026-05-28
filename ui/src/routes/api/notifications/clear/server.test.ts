/**
 * POST /api/notifications/clear -- wipe the activity buffer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clearCalls: { at: number }[] = [];
vi.mock('$lib/server/events', () => ({
  bus: {
    clear: () => clearCalls.push({ at: Date.now() }),
  },
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  clearCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call() {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/notifications/clear'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('pOST /api/notifications/clear', () => {
  it('invokes bus.clear() exactly once', async () => {
    await call();
    expect(clearCalls.length).toBe(1);
  });

  it('returns { ok: true, cleared: true }', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.cleared).toBe(true);
  });

  it('is idempotent over repeated calls', async () => {
    await call();
    await call();
    await call();
    expect(clearCalls.length).toBe(3);
  });
});
