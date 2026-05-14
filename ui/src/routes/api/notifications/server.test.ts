/**
 * GET /api/notifications — recent activity events scoped to current user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RecentFn = (uid: string) => { id: string; source: string }[];
type RequireUserIdFn = (locals: unknown) => string;
let recentForUser: RecentFn = (_uid) => [{ id: 'e1', source: 's' }];
let requireUserId: RequireUserIdFn = (_locals) => 'user-1';

vi.mock('$lib/server/events', () => ({
  bus: {
    recentForUser: (uid: string) => recentForUser(uid),
  },
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers', () => ({
  requireUserId: (locals: unknown) => requireUserId(locals),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  recentForUser = (_uid) => [{ id: 'e1', source: 's' }];
  requireUserId = (_locals) => 'user-1';
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call(locals?: unknown) {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    locals: locals ?? { user: { id: 'user-1' } },
    url: new URL('http://localhost/api/notifications'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/notifications', () => {
  it('returns events for the authenticated user', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.events.length).toBe(1);
  });

  it('passes user id from locals into recentForUser', async () => {
    let receivedUid = '';
    recentForUser = (uid) => {
      receivedUid = uid;
      return [];
    };
    await call();
    expect(receivedUid).toBe('user-1');
  });

  it('401 (via requireUserId throw) when locals.user is missing', async () => {
    requireUserId = (_locals) => {
      const e = new Error('unauthenticated') as Error & {
        status: number;
        body: unknown;
      };
      e.status = 401;
      e.body = { message: 'unauthenticated', code: 'UNAUTHENTICATED' };
      throw e;
    };
    const r = await call({});
    expect(r.status).toBe(401);
  });

  it('events array is empty when bus returns []', async () => {
    recentForUser = (_uid) => [];
    const r = await call();
    expect(r.body.events).toEqual([]);
  });
});
