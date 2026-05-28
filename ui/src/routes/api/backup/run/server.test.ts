/**
 * POST /api/backup/run -- owner-only manual backup trigger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isOwner = true;
const createCalls: number[] = [];
let createResult: unknown = { id: 'b1', sizeBytes: 12345 };

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
  createBackup: async () => {
    createCalls.push(Date.now());
    return createResult;
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  isOwner = true;
  createCalls.length = 0;
  createResult = { id: 'b1', sizeBytes: 12345 };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post() {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/backup/run'),
    request: new Request('http://localhost/api/backup/run', { method: 'POST' }),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('pOST /api/backup/run', () => {
  it('owner triggers createBackup + receives the result', async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('b1');
    expect(r.body.sizeBytes).toBe(12345);
    expect(createCalls.length).toBe(1);
  });

  it('non-owner gets 403 + no backup created', async () => {
    isOwner = false;
    const r = await post();
    expect(r.status).toBe(403);
    expect(createCalls.length).toBe(0);
  });
});
