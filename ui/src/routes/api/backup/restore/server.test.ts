/**
 * POST /api/backup/restore -- owner-only restore from snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isOwner = true;
const restoreCalls: string[] = [];

vi.mock('$lib/server/auth-helpers', () => ({
  requireOwner: () => {
    if (!isOwner) {
      const e = new Error('forbidden') as Error & { status: number; body: unknown };
      e.status = 403;
      e.body = { message: 'forbidden', code: 'FORBIDDEN' };
      throw e;
    }
  },
}));

vi.mock('$lib/server/backup', () => ({
  restoreBackup: async (id: string) => {
    restoreCalls.push(id);
    return { ok: true, restoredId: id };
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  isOwner = true;
  restoreCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/backup/restore'),
    request: new Request('http://localhost/api/backup/restore', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('pOST /api/backup/restore', () => {
  it('400 when id is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
    expect(restoreCalls.length).toBe(0);
  });

  it('400 when id is not a string', async () => {
    const r = await post({ id: 123 });
    expect(r.status).toBe(400);
  });

  it('400 when body is malformed JSON', async () => {
    const r = await post('not-json');
    expect(r.status).toBe(400);
  });

  it('owner can restore a specific id', async () => {
    const r = await post({ id: 'b-2026-05-14' });
    expect(r.status).toBe(200);
    expect(r.body.restoredId).toBe('b-2026-05-14');
  });

  it('non-owner gets 403', async () => {
    isOwner = false;
    const r = await post({ id: 'b1' });
    expect(r.status).toBe(403);
    expect(restoreCalls.length).toBe(0);
  });
});
