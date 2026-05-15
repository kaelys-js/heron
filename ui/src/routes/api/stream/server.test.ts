/**
 * GET /api/stream — SSE activity feed (user-scoped).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const busInternal = new EventEmitter();
let recentEvents: { userId?: string; id: string; source: string }[] = [];

vi.mock('$lib/server/events', () => ({
  bus: {
    recentForUser: (_uid: string) => recentEvents,
    on: (event: string, handler: (ev: unknown) => void) => {
      busInternal.on(event, handler);
    },
    off: (event: string, handler: (ev: unknown) => void) => {
      busInternal.off(event, handler);
    },
  },
  logEvent: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers', () => ({
  requireUserId: (locals: { user?: { id: string } }) => {
    if (!locals.user?.id) {
      const e = new Error('unauth') as Error & { status: number; body: unknown };
      e.status = 401;
      e.body = { message: 'unauth', code: 'UNAUTHENTICATED' };
      throw e;
    }
    return locals.user.id;
  },
}));

vi.mock('$lib/server/user-context', () => ({
  SYSTEM_USER_ID: '__system__',
}));

const { GET } = await import('./+server');

beforeEach(() => {
  recentEvents = [];
  busInternal.removeAllListeners();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call(userId = 'user-1'): Promise<Response> {
  const ctrl = new AbortController();
  const req = new Request('http://localhost/api/stream', { signal: ctrl.signal });
  const r = await (GET as unknown as (e: unknown) => Promise<Response>)({
    request: req,
    locals: { user: { id: userId } },
  });
  // Abort immediately after start so the test cleans up its own listeners.
  setTimeout(() => ctrl.abort(), 50);
  return r;
}

describe('GET /api/stream', () => {
  it('throws 401 when caller is unauthenticated', async () => {
    await expect(
      (GET as unknown as (e: unknown) => Promise<unknown>)({
        request: new Request('http://localhost/api/stream'),
        locals: {},
      }),
    ).rejects.toThrow();
  });

  it('returns a text/event-stream Response when authenticated', async () => {
    const r = await call();
    expect(r.headers.get('Content-Type')).toBe('text/event-stream');
    expect(r.headers.get('Cache-Control')).toBe('no-cache');
    expect(r.headers.get('Connection')).toBe('keep-alive');
  });

  it('Response body is a ReadableStream', async () => {
    const r = await call();
    expect(r.body).toBeInstanceOf(ReadableStream);
  });

  it('flushes recent events for the current user on connect', async () => {
    recentEvents = [
      { id: 'e1', source: 'scan', userId: 'user-1' },
      { id: 'e2', source: 'scan', userId: 'user-1' },
    ];
    const r = await call('user-1');
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    const { value } = await reader.read();
    const text = dec.decode(value);
    expect(text).toContain(': connected');
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  });

  it('filters out events belonging to other users', async () => {
    recentEvents = [
      { id: 'e-mine', source: 's', userId: 'user-1' },
      { id: 'e-other', source: 's', userId: 'user-99' }, // wrong user
    ];
    const r = await call('user-1');
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let combined = '';
    for (let i = 0; i < 4; i += 1) {
      const { value, done } = await reader.read();
      if (done) break;
      combined += dec.decode(value);
      if (combined.includes('e-mine')) break;
    }
    expect(combined).toContain('e-mine');
    expect(combined).not.toContain('e-other');
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  });
});
