/**
 * GET + PUT /api/backup/config — retention settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isOwner = true;
let stored: { retentionDays: number } = { retentionDays: 30 };
const writeCalls: { retentionDays: number }[] = [];

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
  readBackupConfig: () => stored,
  writeBackupConfig: (cfg: { retentionDays: number }) => {
    writeCalls.push(cfg);
    stored = cfg;
    return cfg;
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET, PUT } = await import('./+server');

beforeEach(() => {
  isOwner = true;
  stored = { retentionDays: 30 };
  writeCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/backup/config'),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function put(body: unknown) {
  const r = (await (PUT as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/backup/config'),
    request: new Request('http://localhost/api/backup/config', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/backup/config', () => {
  it('owner reads current config', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.retentionDays).toBe(30);
  });

  it('non-owner gets 403', async () => {
    isOwner = false;
    const r = await get();
    expect(r.status).toBe(403);
  });
});

describe('PUT /api/backup/config', () => {
  it('writes a valid retentionDays', async () => {
    const r = await put({ retentionDays: 60 });
    expect(r.status).toBe(200);
    expect(writeCalls[0].retentionDays).toBe(60);
  });

  it('400 when retentionDays is missing', async () => {
    const r = await put({});
    expect(r.status).toBe(400);
  });

  it('400 when retentionDays is non-numeric', async () => {
    const r = await put({ retentionDays: 'forever' });
    expect(r.status).toBe(400);
  });

  it('400 when retentionDays is < 1', async () => {
    const r = await put({ retentionDays: 0 });
    expect(r.status).toBe(400);
  });

  it('400 when retentionDays is negative', async () => {
    const r = await put({ retentionDays: -7 });
    expect(r.status).toBe(400);
  });

  it('non-owner gets 403', async () => {
    isOwner = false;
    const r = await put({ retentionDays: 90 });
    expect(r.status).toBe(403);
    expect(writeCalls.length).toBe(0);
  });
});
