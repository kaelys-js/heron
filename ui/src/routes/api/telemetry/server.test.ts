/**
 * POST/GET /api/telemetry -- the public, rate-limited diagnostics sink.
 *
 * WHY these assertions matter (not just what):
 *  - Telemetry is the QUIET technical-diagnostics path. The whole point of the
 *    reporting refactor is that a render crash / network blip / web-vital must
 *    NOT open an Issue or wake the user. So every test that touches the write
 *    path also asserts reportIssue was NEVER called -- if a future edit routed
 *    telemetry to issues.jsonl, that's the regression these guard.
 *  - Both branches must log with kind:'technical' so $lib/report-routing's
 *    bell-gating keeps them silent regardless of category.
 *  - Public reachability: the route file must export POST/GET (the auth gate is
 *    a separate hooks.server.ts allowlist concern, covered there); a missing
 *    handler would 405 unauthenticated clients trying to report.
 *  - Rate-limiting: a runaway client error loop must get 429'd past the cap so
 *    it can't flood activity.jsonl -- the exact failure mode that grew the log
 *    to gigabytes pre-guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture logEvent calls so we can assert kind/category/level mapping.
const logEvent = vi.fn();
// reportIssue must NEVER be called from this endpoint -- spy on the whole
// issues module so any accidental import + call is caught.
const reportIssue = vi.fn();

vi.mock('$lib/server/events', () => ({
  logEvent,
  reportServerError: vi.fn(),
}));
vi.mock('$lib/server/issues', () => ({
  reportIssue,
  listOpenIssues: () => [],
  listAllIssues: () => [],
  resolveIssue: () => null,
  clearResolved: () => 0,
}));

const { POST, GET, _resetRateLimit } = await import('./+server');

type EventArgs = [source: string, title: string, opts: Record<string, unknown>];

function makeEvent(body: unknown, opts: { ip?: string; sessionId?: string } = {}) {
  const url = 'http://localhost/api/telemetry';
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    getClientAddress: () => opts.ip ?? '10.0.0.1',
    locals: {
      session: opts.sessionId ? { id: opts.sessionId } : null,
      user: null,
      requestId: 'req-test',
    } as unknown as App.Locals,
  };
}

async function post(body: unknown, opts?: { ip?: string; sessionId?: string }) {
  const r = await (POST as (e: unknown) => Promise<Response>)(makeEvent(body, opts));
  return { status: r.status, json: r.status === 204 ? null : await r.json() };
}

beforeEach(() => {
  _resetRateLimit();
  logEvent.mockReset();
  reportIssue.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/telemetry -- type: error', () => {
  it('writes a technical diagnostics event + NEVER opens an Issue', async () => {
    const r = await post({
      type: 'error',
      level: 'error',
      source: 'window.onerror',
      summary: 'TypeError: x is not a function',
      detail: 'while loading /inbox',
      stack: 'Error: boom\n  at f (app.js:1)',
      route: '/inbox',
      requestId: 'req-abc',
    });
    expect(r.status).toBe(204);
    // Exactly one bus write, and it's a QUIET technical event.
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [source, title, opts] = logEvent.mock.calls[0] as EventArgs;
    expect(source).toBe('window.onerror');
    expect(title).toBe('TypeError: x is not a function');
    expect(opts.kind).toBe('technical');
    expect(opts.level).toBe('error');
    expect(opts.message).toBe('while loading /inbox');
    expect(opts.stack).toContain('at f (app.js:1)');
    // Correlation: the client's ORIGINAL X-Request-Id must thread into the log
    // so support can grep activity.jsonl for the on-screen ref. Dropping it severs
    // the chain for every client-side error.
    expect(opts.requestId).toBe('req-abc');
    // The contract's whole purpose: diagnostics never become Issues.
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('clamps level to the technical set (only info/warn pass, else error)', async () => {
    await post({ type: 'error', level: 'info', summary: 'a' });
    await post({ type: 'error', level: 'warn', summary: 'b' });
    await post({ type: 'error', level: 'bogus' as unknown as 'error', summary: 'c' });
    await post({ type: 'error', summary: 'd' }); // no level
    const levels = logEvent.mock.calls.map((c) => (c[2] as Record<string, unknown>).level);
    expect(levels).toEqual(['info', 'warn', 'error', 'error']);
  });

  it('400s a missing summary (no event, no Issue)', async () => {
    const r = await post({ type: 'error', level: 'error', source: 'client' });
    expect(r.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
    expect(reportIssue).not.toHaveBeenCalled();
  });
});

describe('POST /api/telemetry -- type: vitals', () => {
  it('writes a technical web-vitals event + NEVER opens an Issue', async () => {
    const r = await post({
      type: 'vitals',
      name: 'LCP',
      value: 1234.5,
      rating: 'good',
      route: '/inbox',
    });
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [source, title, opts] = logEvent.mock.calls[0] as EventArgs;
    expect(source).toBe('web-vitals');
    expect(title).toBe('LCP');
    expect(opts.kind).toBe('technical');
    expect(opts.level).toBe('info'); // vitals are always info-level diagnostics
    expect(String(opts.message)).toContain('1234.5');
    expect(String(opts.message)).toContain('(good)');
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('400s a NaN / non-finite value (would corrupt trend math)', async () => {
    const r = await post({ type: 'vitals', name: 'LCP', value: 'nope' as unknown as number });
    expect(r.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('increments the GET beacon counter only on an accepted vitals POST', async () => {
    const before = (await (GET as () => Promise<Response>)().then((r) => r.json())) as {
      count: number;
    };
    await post({ type: 'vitals', name: 'CLS', value: 0.02, rating: 'good', route: '/x' });
    await post({ type: 'error', summary: 'not a vital' }); // must NOT bump the counter
    const after = (await (GET as () => Promise<Response>)().then((r) => r.json())) as {
      count: number;
      lastName: string | null;
      lastRoute: string | null;
    };
    expect(after.count).toBe(before.count + 1);
    expect(after.lastName).toBe('CLS');
    expect(after.lastRoute).toBe('/x');
  });
});

describe('POST /api/telemetry -- oversize body', () => {
  function postWithLength(contentLength: string, body: unknown) {
    const event = {
      request: new Request('http://localhost/api/telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': contentLength },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      getClientAddress: () => '10.0.0.5',
      locals: { session: null, user: null, requestId: 'req-test' } as unknown as App.Locals,
    };
    return (POST as (e: unknown) => Promise<Response>)(event);
  }

  it('400s a >1MiB Content-Length BEFORE logEvent (no parse, no event)', async () => {
    // WHY: an oversize body must be rejected from the declared length without
    // ever paying the JSON.parse cost -- so logEvent must NOT fire. This is the
    // memory-safety guard against a client streaming a multi-megabyte report.
    const r = await postWithLength(String(2 * 1024 * 1024), {
      type: 'error',
      summary: 'huge',
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('too-large');
    expect(logEvent).not.toHaveBeenCalled();
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('still 204s a normal-sized body (the cap does not block honest reports)', async () => {
    const r = await postWithLength('120', { type: 'error', summary: 'small' });
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/telemetry -- error body carries the app build', () => {
  it('folds the client build into the persisted stack for later symbolication', async () => {
    // WHY: minified prod stacks are only legible if the build that produced
    // them is recoverable. The handler must persist the build alongside the
    // stack so scripts/system/symbolicate.mjs can find the matching .js.map.
    await post({
      type: 'error',
      summary: 'TypeError: boom',
      stack: 'Error: boom\n  at f (app-abc123.js:1:50)',
      build: '1.2.3+deadbee',
    });
    const opts = logEvent.mock.calls[0][2] as Record<string, unknown>;
    expect(String(opts.stack)).toContain('build: 1.2.3+deadbee');
    expect(String(opts.stack)).toContain('app-abc123.js:1:50');
  });
});

describe('POST /api/telemetry -- malformed', () => {
  it('400s invalid JSON', async () => {
    const r = await post('{not json');
    expect(r.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('400s an unknown type', async () => {
    const r = await post({ type: 'spooky' });
    expect(r.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/telemetry -- rate limiting', () => {
  it('429s once the per-IP+session token bucket is exhausted', async () => {
    // WHY: a runaway client error loop must be capped server-side so it can't
    // flood activity.jsonl. Capacity is 60; the 61st rapid call (same key, no
    // time for refill) must 429. Use one stable key so refill stays ~0.
    let last = 0;
    let blocked = 0;
    for (let i = 0; i < 70; i++) {
      const r = await post(
        { type: 'error', summary: `e${i}` },
        { ip: '203.0.113.9', sessionId: 'sess-flood' },
      );
      last = r.status;
      if (r.status === 429) {
        blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0); // some calls were rejected
    expect(last).toBe(429); // and we're still blocked at the end of the burst
  });

  it('keeps separate buckets per IP+session (one flooder does not 429 others)', async () => {
    // Exhaust client A.
    for (let i = 0; i < 65; i++) {
      await post({ type: 'error', summary: 'a' }, { ip: '1.1.1.1', sessionId: 'A' });
    }
    const aBlocked = await post({ type: 'error', summary: 'a' }, { ip: '1.1.1.1', sessionId: 'A' });
    expect(aBlocked.status).toBe(429);
    // A DIFFERENT session/IP must still be accepted.
    const bOk = await post({ type: 'error', summary: 'b' }, { ip: '2.2.2.2', sessionId: 'B' });
    expect(bOk.status).toBe(204);
  });
});

describe('POST /api/telemetry -- CSP / Reporting-API violation reports', () => {
  function postReport(contentType: string, body: unknown, origin?: string) {
    const headers: Record<string, string> = { 'content-type': contentType };
    if (origin !== undefined) {
      headers.origin = origin;
    }
    const event = {
      request: new Request('http://localhost/api/telemetry', {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      getClientAddress: () => '10.0.0.2',
      locals: { session: null, user: null, requestId: 'req-test' } as unknown as App.Locals,
    };
    return (POST as (e: unknown) => Promise<Response>)(event);
  }

  it('legacy application/csp-report -> one technical warn event, NEVER an Issue', async () => {
    const r = await postReport('application/csp-report', {
      'csp-report': {
        'document-uri': 'https://app/x',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/x.js',
      },
    });
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [source, title, opts] = logEvent.mock.calls[0] as EventArgs;
    expect(source).toBe('csp');
    expect(title).toContain('script-src-elem');
    expect(opts.kind).toBe('technical');
    expect(opts.level).toBe('warn');
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('modern application/reports+json batch -> one technical event per report', async () => {
    const r = await postReport('application/reports+json', [
      {
        type: 'csp-violation',
        url: 'https://app/x',
        body: { effectiveDirective: 'img-src', blockedURL: 'https://evil/x.png' },
      },
      { type: 'deprecation', url: 'https://app/x', body: { message: 'foo() is deprecated' } },
    ]);
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(2);
    const sources = logEvent.mock.calls.map((c) => c[0]);
    expect(sources).toContain('csp'); // csp-violation normalises to 'csp'
    expect(sources).toContain('deprecation');
    for (const c of logEvent.mock.calls) {
      expect((c[2] as Record<string, unknown>).kind).toBe('technical');
    }
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('caps a flood batch at 10 reports (one giant POST cannot spam the feed)', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      type: 'csp-violation',
      body: { effectiveDirective: `d${i}` },
    }));
    const r = await postReport('application/reports+json', many);
    expect(r.status).toBe(204);
    expect(logEvent.mock.calls.length).toBeLessThanOrEqual(10);
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('400s a malformed report body (no event, no Issue)', async () => {
    const r = await postReport('application/csp-report', 'not json{');
    expect(r.status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it('accepts a null-origin browser report untagged (the standard report path)', async () => {
    // WHY: browsers post genuine CSP reports with Origin: null (opaque-origin
    // documents, report-uri POSTs). Tagging those as foreign would mislabel
    // every legit report, so null/absent origin must pass through clean.
    const r = await postReport(
      'application/csp-report',
      { 'csp-report': { 'effective-directive': 'script-src' } },
      'null',
    );
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][0]).toBe('csp'); // not foreign:csp
  });

  it('tags (does not drop) a cross-origin report so a forged flood is visible', async () => {
    // WHY: a report POSTed from a DIFFERENT site can't be a first-party browser
    // report. We accept-but-tag (a hard 400 risks dropping a real report from an
    // origin shape we didn't anticipate) so the persisted event is filterable.
    const r = await postReport(
      'application/csp-report',
      { 'csp-report': { 'effective-directive': 'script-src' } },
      'https://evil.example',
    );
    expect(r.status).toBe(204);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][0]).toBe('foreign:csp');
    expect(reportIssue).not.toHaveBeenCalled();
  });
});
