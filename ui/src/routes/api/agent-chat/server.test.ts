/**
 * POST /api/agent-chat — Anthropic chat wrapper.
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
    if (p === '/tmp/modes') return ['oferta.md', 'apply.md', 'scan.md'];
    if (p.includes('reports')) return ['001.md', '002.md', '003.md'];
    return [];
  }),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  chatCalls.length = 0;
  nextChatReply = 'mocked reply';
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/agent-chat'),
    request: new Request('http://localhost/api/agent-chat', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
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
    expect(chatCalls[0].sys).toMatch(/oferta\.md/);
  });

  it('includes the most recent 5 reports in the system prompt', async () => {
    fsMock.readdirSync.mockImplementation((p: string) => {
      if (p === '/tmp/modes') return ['oferta.md'];
      if (p.includes('reports')) return Array.from({ length: 10 }, (_, i) => 'r' + i + '.md');
      return [];
    });
    await post({});
    expect(chatCalls[0].sys).toContain('r9.md');
    // Earlier reports aren't included
    expect(chatCalls[0].sys).not.toContain('r0.md');
  });
});
