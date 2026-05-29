/**
 * POST /api/linkedin/audit/fix -- mark a finding resolved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let nextResult: { findings: unknown[]; grade: number } | null = {
  findings: [],
  grade: 80,
};
const markCalls: string[] = [];

vi.mock('$lib/server/linkedin-audit', () => ({
  markFindingResolved: (kind: string) => {
    markCalls.push(kind);
    return nextResult;
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  markCalls.length = 0;
  nextResult = { findings: [], grade: 80 };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/linkedin/audit/fix'),
    request: new Request('http://localhost/api/linkedin/audit/fix', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('pOST /api/linkedin/audit/fix', () => {
  it('400 when kind is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when body is malformed JSON', async () => {
    const r = await post('not-json');
    expect(r.status).toBe(400);
  });

  it('marks finding resolved + returns the updated report', async () => {
    const r = await post({ kind: 'no-photo' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.report.grade).toBe(80);
    expect(markCalls).toEqual(['no-photo']);
  });

  it('returns ok=false when no audit report exists', async () => {
    nextResult = null;
    const r = await post({ kind: 'no-photo' });
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/No audit report/);
  });
});
