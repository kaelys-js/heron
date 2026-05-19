/**
 * POST /api/agent-chat -- Anthropic chat wrapper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chatCalls: { sys: string; history: unknown[] }[] = [];
let nextChatReply = 'mocked reply';

vi.mock('$lib/server/ai', () => ({
  chat: async (sys: string, history: unknown[]) => {
    chatCalls.push({ sys, history });
    return nextChatReply;
  },
}));

vi.mock('$lib/server/files', () => ({
  readSafe: (p: string) => (p.includes('cv-md') ? '# CV\nName: Alice' : 'name: alice'),
  MODES_DIR: '/tmp/modes',
}));

vi.mock('$lib/server/profile-paths', () => ({
  activePath: (key: string) => '/tmp/' + key,
}));

vi.mock('$lib/config/branding', () => ({
  APP_NAME: 'heron',
  CLI_NAMESPACE: 'heron',
}));

const fsMock = {
  readdirSync: vi.fn((p: string) => {
    if (p === '/tmp/modes') return ['evaluate.md', 'apply.md', 'scan.md'];
    if (p.includes('reports')) return ['001.md', '002.md', '003.md'];
    return [];
  }),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

// F29 -- stub auth-helpers so the test doesn't import the DB transitively.
// Match the real implementation by throwing SvelteKit's HttpError (which
// the wrap() helper unwraps into a Response with the correct status).
vi.mock('$lib/server/auth-helpers', async () => {
  const { error } = await import('@sveltejs/kit');
  return {
    requireUserId: (locals: { user?: { id: string } | null }) => {
      if (!locals?.user) throw error(401, 'unauthenticated');
      return locals.user.id;
    },
  };
});

const { POST } = await import('./+server');

beforeEach(() => {
  chatCalls.length = 0;
  nextChatReply = 'mocked reply';
});

afterEach(() => {
  vi.clearAllMocks();
});

// F29 -- handler now calls requireUserId; tests provide a fake authed
// locals so the requireUserId guard passes. Anonymous-call test below
// asserts the guard 401s.
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

async function post(body: unknown, locals: App.Locals = FAKE_LOCALS) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/agent-chat'),
    request: new Request('http://localhost/api/agent-chat', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    locals,
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/agent-chat', () => {
  it('400 when history is provided but not an array', async () => {
    const r = await post({ history: 'not-an-array' });
    expect(r.status).toBe(400);
  });

  it('accepts a valid history array', async () => {
    const r = await post({ history: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(200);
  });

  it('accepts empty / missing history', async () => {
    const r = await post({});
    expect(r.status).toBe(200);
  });

  it('passes the brand namespace into the system prompt', async () => {
    await post({});
    expect(chatCalls[0].sys).toContain('/heron');
  });

  it('includes the available modes list in the system prompt', async () => {
    await post({});
    expect(chatCalls[0].sys).toMatch(/evaluate\.md/);
  });

  it('includes the most recent 5 reports in the system prompt', async () => {
    fsMock.readdirSync.mockImplementation((p: string) => {
      if (p === '/tmp/modes') return ['evaluate.md'];
      if (p.includes('reports')) return Array.from({ length: 10 }, (_, i) => 'r' + i + '.md');
      return [];
    });
    await post({});
    expect(chatCalls[0].sys).toContain('r9.md');
    // Earlier reports aren't included
    expect(chatCalls[0].sys).not.toContain('r0.md');
  });

  it('401s an anonymous request (F29 defense-in-depth)', async () => {
    const ANON_LOCALS = { user: null, session: null } as unknown as App.Locals;
    const r = await post({}, ANON_LOCALS);
    expect(r.status).toBe(401);
  });
});
