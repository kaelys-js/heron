/**
 * tray-http.test -- fetchStats + postEmpty unit tests.
 *
 * Strategy: mock node:http and node:https with EventEmitter-driven
 * fakes so we can simulate the full request/response lifecycle:
 * success, error, timeout, non-JSON body. The tests run in node mode
 * (no jsdom) because the modules under test are pure node-native.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Per-test request/response control ─────────────────────────────
type FakeReq = EventEmitter & {
  end: () => void;
  destroy: () => void;
};
type FakeRes = EventEmitter & {
  resume: () => void;
};
type RequestArgs = {
  options: any;
  cb?: (res: FakeRes) => void;
};

let lastRequest: RequestArgs | null = null;
let httpRequestImpl: (opts: any, cb?: (res: FakeRes) => void) => FakeReq;
let httpsRequestImpl: (opts: any, cb?: (res: FakeRes) => void) => FakeReq;

vi.mock('node:http', () => ({
  request: (opts: any, cb?: (res: FakeRes) => void) => httpRequestImpl(opts, cb),
}));
vi.mock('node:https', () => ({
  request: (opts: any, cb?: (res: FakeRes) => void) => httpsRequestImpl(opts, cb),
}));

function makeReq(): FakeReq {
  const req = new EventEmitter() as FakeReq;
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

function makeRes(): FakeRes {
  const res = new EventEmitter() as FakeRes;
  res.resume = vi.fn();
  return res;
}

/** Default impl: hand back a req, the caller drives res via lastRequest.cb */
function defaultRequest(opts: any, cb?: (res: FakeRes) => void): FakeReq {
  lastRequest = { options: opts, cb };
  return makeReq();
}

beforeEach(() => {
  lastRequest = null;
  httpRequestImpl = defaultRequest;
  httpsRequestImpl = defaultRequest;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchStats', () => {
  it('parses valid JSON 200 response', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    // The request was created; now drive the response.
    expect(lastRequest).toBeTruthy();
    expect(lastRequest!.options.path).toBe('/api/stats');
    expect(lastRequest!.options.port).toBe('5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit(
      'data',
      Buffer.from(JSON.stringify({ queued: 3, appliedToday: 1, upcomingInterviews: 2 })),
    );
    res.emit('end');
    const stats = await p;
    expect(stats).toEqual({ queued: 3, appliedToday: 1, upcomingInterviews: 2 });
  });

  it('returns null on malformed JSON', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('data', Buffer.from('not-json'));
    res.emit('end');
    expect(await p).toBeNull();
  });

  it('returns null on empty body', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    expect(await p).toBeNull();
  });

  it('returns null on request error', async () => {
    const { fetchStats } = await import('./tray-http.js');
    // Capture the req so we can emit error.
    let captured!: FakeReq;
    httpRequestImpl = (opts) => {
      lastRequest = { options: opts };
      captured = makeReq();
      return captured;
    };
    const p = fetchStats('http://127.0.0.1:5173');
    captured.emit('error', new Error('ECONNREFUSED'));
    expect(await p).toBeNull();
  });

  it('returns null on request timeout', async () => {
    const { fetchStats } = await import('./tray-http.js');
    let captured!: FakeReq;
    httpRequestImpl = (opts) => {
      lastRequest = { options: opts };
      captured = makeReq();
      return captured;
    };
    const p = fetchStats('http://127.0.0.1:5173');
    captured.emit('timeout');
    expect(captured.destroy).toHaveBeenCalled();
    expect(await p).toBeNull();
  });

  it('returns null on response error', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('error', new Error('stream broke'));
    expect(await p).toBeNull();
  });

  it('uses https.request when URL is https', async () => {
    const httpsSpy = vi.fn(defaultRequest);
    httpsRequestImpl = httpsSpy;
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('https://example.com');
    expect(httpsSpy).toHaveBeenCalled();
    expect(lastRequest!.options.port).toBe(443);
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    await p;
  });

  it('uses http.request when URL is http', async () => {
    const httpSpy = vi.fn(defaultRequest);
    httpRequestImpl = httpSpy;
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1');
    expect(httpSpy).toHaveBeenCalled();
    expect(lastRequest!.options.port).toBe(80);
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    await p;
  });

  it('returns null when baseUrl is invalid', async () => {
    const { fetchStats } = await import('./tray-http.js');
    // URL constructor throws on this -- the outer try/catch resolves null.
    const stats = await fetchStats('not a url');
    expect(stats).toBeNull();
  });

  it('handles multiple data chunks', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    const payload = JSON.stringify({ queued: 7, appliedToday: 0, upcomingInterviews: 0 });
    res.emit('data', Buffer.from(payload.slice(0, 10)));
    res.emit('data', Buffer.from(payload.slice(10)));
    res.emit('end');
    const stats = await p;
    expect(stats?.queued).toBe(7);
  });

  it('passes optional fields through (openIssues, autopilotPaused)', async () => {
    const { fetchStats } = await import('./tray-http.js');
    const p = fetchStats('http://127.0.0.1:5173');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          queued: 0,
          appliedToday: 0,
          upcomingInterviews: 0,
          openIssues: 5,
          autopilotPaused: true,
        }),
      ),
    );
    res.emit('end');
    const stats = await p;
    expect(stats?.openIssues).toBe(5);
    expect(stats?.autopilotPaused).toBe(true);
  });
});

describe('postEmpty', () => {
  it('resolves on successful response', async () => {
    const { postEmpty } = await import('./tray-http.js');
    const p = postEmpty('http://127.0.0.1:5173', '/api/jobs/scan-portals/run');
    expect(lastRequest!.options.method).toBe('POST');
    expect(lastRequest!.options.path).toBe('/api/jobs/scan-portals/run');
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    await expect(p).resolves.toBeUndefined();
    expect(res.resume).toHaveBeenCalled();
  });

  it('resolves silently on request error', async () => {
    const { postEmpty } = await import('./tray-http.js');
    let captured!: FakeReq;
    httpRequestImpl = (opts) => {
      lastRequest = { options: opts };
      captured = makeReq();
      return captured;
    };
    const p = postEmpty('http://127.0.0.1:5173', '/api/autopilot/toggle');
    captured.emit('error', new Error('connection refused'));
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves silently on request timeout', async () => {
    const { postEmpty } = await import('./tray-http.js');
    let captured!: FakeReq;
    httpRequestImpl = (opts) => {
      lastRequest = { options: opts };
      captured = makeReq();
      return captured;
    };
    const p = postEmpty('http://127.0.0.1:5173', '/api/jobs/scan/run');
    captured.emit('timeout');
    expect(captured.destroy).toHaveBeenCalled();
    await expect(p).resolves.toBeUndefined();
  });

  it('uses https for https URLs', async () => {
    const httpsSpy = vi.fn(defaultRequest);
    httpsRequestImpl = httpsSpy;
    const { postEmpty } = await import('./tray-http.js');
    const p = postEmpty('https://example.com', '/api/x');
    expect(httpsSpy).toHaveBeenCalled();
    expect(lastRequest!.options.port).toBe(443);
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    await p;
  });

  it('resolves silently when baseUrl is invalid', async () => {
    const { postEmpty } = await import('./tray-http.js');
    await expect(postEmpty('not a url', '/x')).resolves.toBeUndefined();
  });

  it('falls back to default port when URL has none', async () => {
    const { postEmpty } = await import('./tray-http.js');
    const p = postEmpty('http://hostname', '/api/x');
    expect(lastRequest!.options.port).toBe(80);
    const res = makeRes();
    lastRequest!.cb!(res);
    res.emit('end');
    await p;
  });
});
