/**
 * GET + POST /api/settings -- owner-only env management.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let envMasked: Record<string, string> = {};
const writeCalls: Record<string, unknown>[] = [];
let writeShouldThrow = false;
let isOwner = true;

vi.mock('$lib/server/env', () => ({
  loadEnv: vi.fn(),
  readEnvMasked: () => envMasked,
  writeEnv: (updates: Record<string, unknown>) => {
    if (writeShouldThrow) throw new Error('disk full');
    writeCalls.push(updates);
  },
}));

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

const loggedEvents: { source: string; msg: string; meta: unknown }[] = [];
vi.mock('$lib/server/events', () => ({
  logEvent: (source: string, msg: string, meta: unknown) => {
    loggedEvents.push({ source, msg, meta });
  },
  reportServerError: vi.fn(),
}));

const { GET, POST } = await import('./+server');

beforeEach(() => {
  envMasked = { ANTHROPIC_API_KEY: '****abc123', GEMINI_API_KEY: '' };
  writeCalls.length = 0;
  loggedEvents.length = 0;
  writeShouldThrow = false;
  isOwner = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    locals: { user: { role: 'owner' } },
    url: new URL('http://localhost/api/settings'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    request: new Request('http://localhost/api/settings', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals: { user: { role: 'owner' } },
    url: new URL('http://localhost/api/settings'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/settings', () => {
  it('returns masked env when caller is owner', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.ANTHROPIC_API_KEY).toBe('****abc123');
  });

  it('returns 403 when caller is not owner', async () => {
    isOwner = false;
    const r = await get();
    expect(r.status).toBe(403);
  });
});

describe('POST /api/settings', () => {
  it('accepts a JSON body + writes via writeEnv', async () => {
    const r = await post({ ANTHROPIC_API_KEY: 'new-real-key' });
    expect(r.status).toBe(200);
    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0].ANTHROPIC_API_KEY).toBe('new-real-key');
  });

  it('returns the refreshed masked env after a successful write', async () => {
    envMasked = { ANTHROPIC_API_KEY: '****newkey' };
    const r = await post({ ANTHROPIC_API_KEY: 'new-real-key' });
    expect(r.body.current.ANTHROPIC_API_KEY).toBe('****newkey');
  });

  it('400 on non-JSON body', async () => {
    const r = await post('not json');
    expect(r.status).toBe(400);
  });

  it('400 on JSON null body (truthiness check)', async () => {
    const r = await post('null');
    expect(r.status).toBe(400);
  });

  it('400 on string-typed JSON body', async () => {
    const r = await post('"a-string"');
    expect(r.status).toBe(400);
  });

  it('500 wrapping writeEnv failures', async () => {
    writeShouldThrow = true;
    const r = await post({ ANTHROPIC_API_KEY: 'new' });
    expect(r.status).toBe(500);
  });

  it('logs only non-masked keys as "changed"', async () => {
    await post({
      ANTHROPIC_API_KEY: '****dont-count',
      GEMINI_API_KEY: 'real-new-value',
    });
    const evt = loggedEvents.find((e) => e.source === 'settings');
    const msg = (evt!.meta as { message: string }).message;
    expect(msg).toContain('GEMINI_API_KEY');
    expect(msg).not.toContain('ANTHROPIC_API_KEY');
  });

  it('403 when caller is not owner', async () => {
    isOwner = false;
    const r = await post({ ANTHROPIC_API_KEY: 'x' });
    expect(r.status).toBe(403);
  });
});
