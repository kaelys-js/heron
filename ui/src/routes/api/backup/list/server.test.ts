/**
 * GET /api/backup/list -- owner-only backup snapshots list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isOwner = true;
let backups: { id: string; createdAt: number }[] = [];
let config: { schedule?: string } = { schedule: 'daily' };

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
  listBackups: () => backups,
  readBackupConfig: () => config,
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  isOwner = true;
  backups = [];
  config = { schedule: 'daily' };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/backup/list'),
    locals: {},
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('gET /api/backup/list', () => {
  it('owner gets backups + config', async () => {
    backups = [
      { id: 'b1', createdAt: 1000 },
      { id: 'b2', createdAt: 2000 },
    ];
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.backups.length).toBe(2);
    expect(r.body.config.schedule).toBe('daily');
  });

  it('non-owner gets 403', async () => {
    isOwner = false;
    const r = await get();
    expect(r.status).toBe(403);
  });

  it('empty backups list is fine', async () => {
    const r = await get();
    expect(r.body.backups).toEqual([]);
  });
});
