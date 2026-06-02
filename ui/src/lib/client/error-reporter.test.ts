/**
 * lib/client/error-reporter -- unified client report funnel.
 *
 * WHY these assertions matter: client reports are TECHNICAL, and the routing
 * matrix ($lib/report-routing) keeps technical QUIET. So the contract under
 * test is:
 *   • A technical report NEVER toasts and NEVER fires an OS notification --
 *     a render crash must not nag the user like a failed apply.
 *   • It DOES POST to /api/telemetry (the diagnostics sink), NOT /api/issues.
 *   • One window 'error' fires the pipeline EXACTLY once (the duplicate
 *     hooks.client.ts listeners were removed -- installErrorReporter is the
 *     single registration site).
 *   • Input coercion (Error / string / arbitrary value) + requestId
 *     correlation + reportWarning/reportInfo wrappers + setReporterBackend
 *     flush still behave.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Toast must never be called by the reporter now -- if it is, these spies
// catch the regression.
const toastCalls = { error: [] as any[], warning: [] as any[], success: [] as any[] };
vi.mock('svelte-sonner', () => ({
  toast: {
    error: (msg: any, opts?: any) => toastCalls.error.push({ msg, opts }),
    warning: (msg: any, opts?: any) => toastCalls.warning.push({ msg, opts }),
    success: (msg: any, opts?: any) => toastCalls.success.push({ msg, opts }),
  },
}));

// OS-notify must never be called either -- spy so we can assert zero calls.
const notifyCalls: any[] = [];
vi.mock('./notifications', () => ({
  notify: vi.fn(async (payload: any) => {
    notifyCalls.push(payload);
  }),
}));

const {
  report,
  reportError,
  reportWarning,
  reportInfo,
  setReporterBackend,
  installErrorReporter,
  _testHelpers,
} = await import('./error-reporter');

/** Read the body of the last fetch the reporter made. */
function lastFetchBody(fetchSpy: ReturnType<typeof vi.fn>): any {
  const call = fetchSpy.mock.calls.at(-1);
  return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
}

describe('report — input coercion', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    notifyCalls.length = 0;
    setReporterBackend(null);
    const { QUEUE_KEY } = _testHelpers();
    localStorage.removeItem(QUEUE_KEY);
  });

  function lastQueued(): { message: string } | undefined {
    const { QUEUE_KEY } = _testHelpers();
    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return queued.at(-1);
  }

  it('accepts an Error instance (queues its message)', async () => {
    await reportError(new Error('boom'));
    expect(lastQueued()?.message).toBe('boom');
  });

  it('coerces a string to an Error', async () => {
    await reportError('plain string');
    expect(lastQueued()?.message).toBe('plain string');
  });

  it('coerces an arbitrary value to an Error', async () => {
    await reportError({ code: 'E_X' });
    expect(lastQueued()?.message).toContain('E_X');
  });
});

describe('report — technical reports stay quiet (the core contract)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    toastCalls.success.length = 0;
    notifyCalls.length = 0;
    fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    setReporterBackend('http://localhost:5173');
  });

  it('does NOT toast and does NOT fire an OS notification', async () => {
    await report({ err: new Error('quiet'), level: 'error', kind: 'technical' });
    expect(toastCalls.error.length).toBe(0);
    expect(toastCalls.warning.length).toBe(0);
    expect(toastCalls.success.length).toBe(0);
    expect(notifyCalls.length).toBe(0);
  });

  it('DOES POST to /api/telemetry with the { type: "error" } body', async () => {
    await report({
      err: new Error('telemetry-payload'),
      level: 'warn',
      kind: 'technical',
      context: { source: 'unit', route: '/inbox' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/\/api\/telemetry$/);
    expect(url).not.toMatch(/\/api\/issues/);
    const body = lastFetchBody(fetchSpy);
    expect(body.type).toBe('error');
    expect(body.level).toBe('warn');
    expect(body.source).toBe('unit');
    expect(body.summary).toBe('telemetry-payload');
    expect(body.route).toBe('/inbox');
  });
});

describe('report — requestId correlation', () => {
  beforeEach(() => {
    setReporterBackend(null);
    const { QUEUE_KEY } = _testHelpers();
    localStorage.removeItem(QUEUE_KEY);
    document.head.innerHTML = '';
  });

  function lastQueuedContext(): { requestId?: string } | undefined {
    const { QUEUE_KEY } = _testHelpers();
    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return queued.at(-1)?.context;
  }

  it('prefers an error’s own .requestId (ApiError) over the page <meta> id', async () => {
    // WHY: the failing request's own X-Request-Id (carried on ApiError from
    // api.ts) pins the EXACT request; the page <meta> id is only the document's
    // request. When a fetch error is reported, the precise id must win so the
    // logged diagnostic correlates to the request that actually failed.
    document.head.innerHTML = '<meta name="x-request-id" content="page-meta-id" />';
    const apiErr = Object.assign(new Error('fetch failed'), { requestId: 'api-req-id' });
    await reportError(apiErr);
    expect(lastQueuedContext()?.requestId).toBe('api-req-id');
  });

  it('falls back to the page <meta> id when the error carries none', async () => {
    document.head.innerHTML = '<meta name="x-request-id" content="page-meta-id" />';
    await reportError(new Error('plain error'));
    expect(lastQueuedContext()?.requestId).toBe('page-meta-id');
  });

  it('an explicit context.requestId still wins over both', async () => {
    document.head.innerHTML = '<meta name="x-request-id" content="page-meta-id" />';
    const apiErr = Object.assign(new Error('fetch failed'), { requestId: 'api-req-id' });
    await reportError(apiErr, { requestId: 'explicit-id' });
    expect(lastQueuedContext()?.requestId).toBe('explicit-id');
  });
});

describe('reportWarning + reportInfo', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    notifyCalls.length = 0;
    setReporterBackend(null);
    const { QUEUE_KEY } = _testHelpers();
    localStorage.removeItem(QUEUE_KEY);
  });

  function lastQueued(): { level: string; message: string } | undefined {
    const { QUEUE_KEY } = _testHelpers();
    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return queued.at(-1);
  }

  it('reportWarning routes through report() at level=warn (and stays quiet)', async () => {
    await reportWarning(new Error('w'));
    expect(lastQueued()?.level).toBe('warn');
    expect(toastCalls.error.length).toBe(0);
  });

  it('reportInfo wraps a string into an Error and routes as info', async () => {
    await reportInfo('hello');
    const q = lastQueued();
    expect(q?.level).toBe('info');
    expect(q?.message).toBe('hello');
    expect(toastCalls.error.length).toBe(0);
  });
});

describe('installErrorReporter — single window listener (no double-fire)', () => {
  it('dispatching one window error triggers exactly one telemetry POST', async () => {
    // Isolate from any queued reports left by earlier tests -- a non-empty
    // queue would flush on setReporterBackend and inflate the POST count.
    setReporterBackend(null);
    const { QUEUE_KEY } = _testHelpers();
    localStorage.removeItem(QUEUE_KEY);
    const fetchSpy = vi.fn(async (_url?: any, _init?: any) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    // installErrorReporter is the ONE registration site; hooks.client.ts no
    // longer adds its own window listeners, so a single 'error' must report
    // once -- not twice.
    installErrorReporter('http://localhost:5173');
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('single-fire'), message: 'single-fire' }),
    );
    // Let the async report() POST settle.
    await new Promise<void>((r) => setTimeout(r, 0));
    const telemetryPosts = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).endsWith('/api/telemetry'),
    );
    expect(telemetryPosts.length).toBe(1);
  });
});

describe('setReporterBackend', () => {
  it('accepts a URL string', () => {
    expect(() => setReporterBackend('http://localhost:5173')).not.toThrow();
  });

  it('accepts null to clear', () => {
    expect(() => setReporterBackend(null)).not.toThrow();
  });
});
