/**
 * GET + POST + DELETE /api/issues.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestIssue = {
  id: string;
  summary: string;
  source: string;
  severity?: string;
  detail?: string;
  dedupeKey?: string;
};
const openIssues: TestIssue[] = [];
const resolvedIssues: TestIssue[] = [];
// Captures the last reportIssue() input so create-branch tests can assert the
// endpoint mapped the client body (level→severity, stack/route/requestId→detail).
let lastReported: Record<string, unknown> | null = null;
let nextId = 0;

vi.mock('$lib/server/issues', () => ({
  listOpenIssues: () => openIssues,
  listAllIssues: () => [...openIssues, ...resolvedIssues],
  resolveIssue: (id: string) => {
    const idx = openIssues.findIndex((i) => i.id === id);
    if (idx === -1) {
      return null;
    }
    const [issue] = openIssues.splice(idx, 1);
    resolvedIssues.push(issue);
    return issue;
  },
  clearResolved: () => {
    const n = resolvedIssues.length;
    resolvedIssues.length = 0;
    return n;
  },
  // Stand-in for the real append-and-dedupe writer: record the input + persist
  // a synthesized open issue so the route's create branch is exercised end-to-end.
  reportIssue: (input: Record<string, unknown>) => {
    lastReported = input;
    const issue: TestIssue = {
      id: `gen-${++nextId}`,
      summary: String(input.summary),
      source: String(input.source),
      severity: input.severity as string,
      detail: input.detail as string | undefined,
      dedupeKey: input.dedupeKey as string | undefined,
    };
    openIssues.push(issue);
    return issue;
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
  lastReported = null;
  nextId = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get(qs = '') {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL(`http://localhost/api/issues${qs}`),
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

describe('gET /api/issues', () => {
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

describe('pOST /api/issues', () => {
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

describe('pOST /api/issues -- create branch removed (product-only endpoint)', () => {
  // WHY: this endpoint used to accept a client-shaped body (browser/native
  // error reporter) and CREATE an Issue. The reporting refactor makes Issue
  // creation SERVER-ONLY (reportIssue); the browser's technical diagnostics now
  // POST to /api/telemetry instead. So a summary/title-only body must NOT open
  // an Issue here -- it 400s, and reportIssue is never reached from the route.
  it('does NOT create an Issue from a client summary body (now 400)', async () => {
    const r = await post({
      source: 'window.onerror',
      level: 'error',
      summary: 'TypeError: x is not a function',
      route: '/inbox',
    });
    expect(r.status).toBe(400);
    expect(openIssues.length).toBe(0);
    // The route must not have called the issue writer at all.
    expect(lastReported).toBeNull();
  });

  it('does NOT create an Issue from a `title`-only body either', async () => {
    const r = await post({ title: 'Boom', level: 'warn' });
    expect(r.status).toBe(400);
    expect(openIssues.length).toBe(0);
    expect(lastReported).toBeNull();
  });

  it('400 when neither id nor anything else is present', async () => {
    const r = await post({ source: 'client', level: 'error' });
    expect(r.status).toBe(400);
    expect(lastReported).toBeNull();
  });
});

describe('dELETE /api/issues', () => {
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
