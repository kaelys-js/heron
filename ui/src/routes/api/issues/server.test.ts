/**
 * GET + POST + DELETE /api/issues.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openIssues: { id: string; summary: string; source: string }[] = [];
const resolvedIssues: { id: string; summary: string; source: string }[] = [];

vi.mock('$lib/server/issues', () => ({
  listOpenIssues: () => openIssues,
  listAllIssues: () => [...openIssues, ...resolvedIssues],
  resolveIssue: (id: string) => {
    const idx = openIssues.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const [issue] = openIssues.splice(idx, 1);
    resolvedIssues.push(issue);
    return issue;
  },
  clearResolved: () => {
    const n = resolvedIssues.length;
    resolvedIssues.length = 0;
    return n;
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { GET, POST, DELETE } = await import('./+server');

beforeEach(() => {
  openIssues.length = 0;
  resolvedIssues.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get(qs = '') {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/issues' + qs),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/issues'),
    request: new Request('http://localhost/api/issues', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function del() {
  const r = (await (DELETE as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/issues'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/issues', () => {
  it('returns open issues by default', async () => {
    openIssues.push({ id: 'i1', summary: 'open one', source: 'liveness' });
    resolvedIssues.push({ id: 'i2', summary: 'done', source: 'liveness' });
    const r = await get();
    expect(r.body.issues.length).toBe(1);
    expect(r.body.issues[0].id).toBe('i1');
  });

  it('includes resolved when ?include=resolved', async () => {
    openIssues.push({ id: 'i1', summary: 'open', source: 's' });
    resolvedIssues.push({ id: 'i2', summary: 'done', source: 's' });
    const r = await get('?include=resolved');
    expect(r.body.issues.length).toBe(2);
  });
});

describe('POST /api/issues', () => {
  it('400 when id is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when id does not match any open issue', async () => {
    const r = await post({ id: 'ghost' });
    expect(r.status).toBe(400);
  });

  it('resolves the matching issue + returns it', async () => {
    openIssues.push({ id: 'i1', summary: 'open', source: 'liveness' });
    const r = await post({ id: 'i1' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.issue.id).toBe('i1');
    expect(openIssues.length).toBe(0);
    expect(resolvedIssues.length).toBe(1);
  });
});

describe('DELETE /api/issues', () => {
  it('returns the count of resolved issues removed', async () => {
    resolvedIssues.push({ id: 'a', summary: 's', source: 's' });
    resolvedIssues.push({ id: 'b', summary: 's', source: 's' });
    const r = await del();
    expect(r.body.removed).toBe(2);
    expect(resolvedIssues.length).toBe(0);
  });

  it('returns 0 when nothing to clear', async () => {
    const r = await del();
    expect(r.body.removed).toBe(0);
  });
});
