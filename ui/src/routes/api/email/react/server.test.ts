/**
 * POST + GET /api/email/react -- IMAP-poller endpoint.
 *
 * F21 -- every handler now calls `requireUserId(locals)` first, so the
 * test harness must hand in a `locals.user` object with a valid id.
 * Anonymous calls 401. The hooks-level guard would normally block
 * those at the framework boundary, but the explicit handler-level call
 * gives defense in depth.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactCalls: unknown[] = [];
let leads: { id: string; subject: string }[] = [];

vi.mock('$lib/server/email-reactor', () => ({
  reactToEmail: (email: unknown) => {
    reactCalls.push(email);
    return { classification: 'recruiter-lead', actions: [] };
  },
  listLeads: () => leads,
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST, GET } = await import('./+server');

/** Stand-in `locals` with a valid authed user -- every test in this
 *  file exercises an authenticated path so we don't bother per-test
 *  customisation. */
const FAKE_LOCALS = {
  user: {
    id: 'user-test',
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner' as const,
    deletedAt: null,
  },
  session: null,
} as unknown as App.Locals;

beforeEach(() => {
  reactCalls.length = 0;
  leads = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown, locals: App.Locals = FAKE_LOCALS) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/email/react'),
    request: new Request('http://localhost/api/email/react', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals,
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function get(locals: App.Locals = FAKE_LOCALS) {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/email/react'),
    locals,
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/email/react', () => {
  it('400 when from is missing', async () => {
    const r = await post({ subject: 'hi' });
    expect(r.status).toBe(400);
  });

  it('400 when subject is missing', async () => {
    const r = await post({ from: 'a@b' });
    expect(r.status).toBe(400);
  });

  it('reacts to a complete email', async () => {
    const r = await post({ from: 'rec@co.com', subject: 'Coffee?', body: 'Interested' });
    expect(r.status).toBe(200);
    expect(r.body.classification).toBe('recruiter-lead');
  });

  it('stamps ts to now when omitted', async () => {
    const before = Date.now();
    await post({ from: 'a@b', subject: 'x' });
    const email = reactCalls[0] as { ts: number };
    expect(email.ts).toBeGreaterThanOrEqual(before);
  });

  it('preserves explicit ts', async () => {
    await post({ from: 'a@b', subject: 'x', ts: 123456 });
    expect((reactCalls[0] as { ts: number }).ts).toBe(123456);
  });

  it('preserves messageId when present', async () => {
    await post({ from: 'a@b', subject: 'x', messageId: 'mid-1' });
    expect((reactCalls[0] as { messageId: string }).messageId).toBe('mid-1');
  });
});

describe('GET /api/email/react', () => {
  it('returns up to 50 inbound-lead rows', async () => {
    leads = Array.from({ length: 100 }, (_, i) => ({ id: 'l' + i, subject: 's' }));
    const r = await get();
    expect(r.body.leads.length).toBe(50);
  });

  it('returns [] when no leads exist yet', async () => {
    const r = await get();
    expect(r.body.leads).toEqual([]);
  });
});

describe('Auth (F21 defense-in-depth)', () => {
  const ANON_LOCALS = { user: null, session: null } as unknown as App.Locals;

  it('POST without locals.user 401s', async () => {
    const r = await post({ from: 'a@b', subject: 's' }, ANON_LOCALS);
    expect(r.status).toBe(401);
  });

  it('GET without locals.user 401s', async () => {
    const r = await get(ANON_LOCALS);
    expect(r.status).toBe(401);
  });
});
