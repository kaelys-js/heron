/**
 * /api/settings/secrets — per-user encrypted credential management.
 *
 * Distinct from /api/settings (owner-only, install-wide .env): this
 * endpoint is open to every authenticated user and operates on THEIR
 * own encrypted secrets file. Multi-user contract: user A's writes
 * never affect user B's reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), 'heron-secrets-api-' + Date.now() + '-' + process.pid);

vi.mock('$lib/server/files', () => ({ ROOT: TMP, readSafe: () => '' }));

// Active-user mock; flipped per case.
let activeUserId = '11111111-1111-1111-1111-111111111111';
vi.mock('$lib/server/auth-helpers', () => ({
  requireUserId: () => activeUserId,
}));

const loggedEvents: { source: string; msg: string; meta: unknown }[] = [];
vi.mock('$lib/server/events', () => ({
  logEvent: (source: string, msg: string, meta: unknown) => {
    loggedEvents.push({ source, msg, meta });
  },
  reportServerError: vi.fn(),
}));

const { DELETE, GET, POST, KNOWN_KEYS } = await import('./+server');
const { setSecret, getSecret } = await import('$lib/server/user-secrets');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'a'.repeat(64);
  activeUserId = USER_A;
  loggedEvents.length = 0;
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    locals: { user: { role: 'member' } },
    url: new URL('http://localhost/api/settings/secrets'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    request: new Request('http://localhost/api/settings/secrets', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals: { user: { role: 'member' } },
    url: new URL('http://localhost/api/settings/secrets'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function del(key: string) {
  const r = (await (DELETE as unknown as (e: unknown) => Promise<Response>)({
    locals: { user: { role: 'member' } },
    url: new URL('http://localhost/api/settings/secrets?key=' + key),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/settings/secrets', () => {
  it('returns empty masks for a new user', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    for (const k of KNOWN_KEYS) {
      expect(r.body[k]).toBe('');
    }
  });

  it('returns masked value for keys the user has set', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-ant-1234567890ABCDEF');
    const r = await get();
    expect(r.body.ANTHROPIC_API_KEY).toBe('****CDEF');
    expect(r.body.GEMINI_API_KEY).toBe(''); // not set
  });

  it('listing is scoped to the current user', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-A-secret-AAAA');
    setSecret(USER_B, 'ANTHROPIC_API_KEY', 'sk-B-secret-BBBB');
    const rA = await get();
    expect(rA.body.ANTHROPIC_API_KEY).toBe('****AAAA');
    // Switch to user B
    activeUserId = USER_B;
    const rB = await get();
    expect(rB.body.ANTHROPIC_API_KEY).toBe('****BBBB');
  });
});

describe('POST /api/settings/secrets', () => {
  it('upserts a single key', async () => {
    const r = await post({ ANTHROPIC_API_KEY: 'sk-ant-FRESH-WRITE-LONG-VALUE' });
    expect(r.status).toBe(200);
    expect(r.body.current.ANTHROPIC_API_KEY).toBe('****ALUE');
    expect(getSecret(USER_A, 'ANTHROPIC_API_KEY')).toBe('sk-ant-FRESH-WRITE-LONG-VALUE');
  });

  it('upserts multiple keys in one call', async () => {
    const r = await post({
      ANTHROPIC_API_KEY: 'sk-ant-multi-LONG-AAAAA',
      GEMINI_API_KEY: 'AIza-multi-LONG-BBBBB',
    });
    expect(r.status).toBe(200);
    expect(getSecret(USER_A, 'ANTHROPIC_API_KEY')).toBe('sk-ant-multi-LONG-AAAAA');
    expect(getSecret(USER_A, 'GEMINI_API_KEY')).toBe('AIza-multi-LONG-BBBBB');
  });

  it('rejects an unknown key with 400', async () => {
    const r = await post({ NOT_A_KNOWN_KEY: 'x' });
    expect(r.status).toBe(400);
  });

  it('empty string deletes a key', async () => {
    setSecret(USER_A, 'GEMINI_API_KEY', 'will-be-removed-LONG-VALUE');
    const r = await post({ GEMINI_API_KEY: '' });
    expect(r.status).toBe(200);
    expect(getSecret(USER_A, 'GEMINI_API_KEY')).toBeNull();
  });

  it('masked round-trip ("****abcd") is a no-op (preserves existing value)', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-ant-DO-NOT-CHANGE-ME');
    const r = await post({ ANTHROPIC_API_KEY: '****E-ME' });
    expect(r.status).toBe(200);
    // Unchanged because the input was the masked round-trip.
    expect(getSecret(USER_A, 'ANTHROPIC_API_KEY')).toBe('sk-ant-DO-NOT-CHANGE-ME');
  });

  it('rejects non-string values with 400', async () => {
    const r = await post({ ANTHROPIC_API_KEY: 42 });
    expect(r.status).toBe(400);
  });

  it("user A's POST does not affect user B's secrets", async () => {
    setSecret(USER_B, 'ANTHROPIC_API_KEY', 'sk-B-untouched-LONG-VAL');
    activeUserId = USER_A;
    await post({ ANTHROPIC_API_KEY: 'sk-A-fresh-LONG-VAL' });
    expect(getSecret(USER_A, 'ANTHROPIC_API_KEY')).toBe('sk-A-fresh-LONG-VAL');
    expect(getSecret(USER_B, 'ANTHROPIC_API_KEY')).toBe('sk-B-untouched-LONG-VAL');
  });

  it('logs an activity event listing changed keys', async () => {
    await post({ ANTHROPIC_API_KEY: 'new-LONG-key-1234' });
    expect(loggedEvents).toHaveLength(1);
    expect(loggedEvents[0].source).toBe('settings.secrets');
    expect((loggedEvents[0].meta as { message: string }).message).toContain('ANTHROPIC_API_KEY');
  });
});

describe('DELETE /api/settings/secrets', () => {
  it('removes the specified key', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'gone-soon-LONG-VAL');
    const r = await del('ANTHROPIC_API_KEY');
    expect(r.status).toBe(200);
    expect(getSecret(USER_A, 'ANTHROPIC_API_KEY')).toBeNull();
  });

  it('400 on missing ?key', async () => {
    const r = (await (DELETE as unknown as (e: unknown) => Promise<Response>)({
      locals: { user: { role: 'member' } },
      url: new URL('http://localhost/api/settings/secrets'),
    } as unknown)) as Response;
    expect(r.status).toBe(400);
  });

  it('400 on unknown key', async () => {
    const r = await del('NOT_A_KNOWN_KEY');
    expect(r.status).toBe(400);
  });
});
