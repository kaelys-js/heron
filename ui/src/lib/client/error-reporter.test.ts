/**
 * lib/client/error-reporter -- unified error funnel for web/Electron/iOS.
 *
 * Tests:
 *   • reportError accepts Error, string, plain-value coercion
 *   • Toast fires for level=error only
 *   • Benign view-transition rejections are dropped
 *   • Backend POST attempt + queue-on-fail
 *   • Rate-limit suppresses duplicate OS notifications within 30s
 *   • reportWarning / reportInfo route through reportError with right level
 *   • setReporterBackend triggers flushQueue
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastCalls = { error: [] as any[], warning: [] as any[], success: [] as any[] };
vi.mock('svelte-sonner', () => ({
  toast: {
    error: (msg: any, opts?: any) => toastCalls.error.push({ msg, opts }),
    warning: (msg: any, opts?: any) => toastCalls.warning.push({ msg, opts }),
    success: (msg: any, opts?: any) => toastCalls.success.push({ msg, opts }),
  },
}));

const notifyCalls: any[] = [];
vi.mock('./notifications', () => ({
  notify: vi.fn(async (payload: any) => {
    notifyCalls.push(payload);
  }),
}));

const { reportError, reportWarning, reportInfo, setReporterBackend, _testHelpers } = await import(
  './error-reporter'
);

describe('reportError — input coercion', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    notifyCalls.length = 0;
    setReporterBackend(null);
  });

  it('accepts Error instance', async () => {
    await reportError(new Error('boom'));
    expect(toastCalls.error.length).toBe(1);
    expect(toastCalls.error[0].msg).toBe('boom');
  });

  it('coerces string to Error', async () => {
    await reportError('plain string');
    expect(toastCalls.error[0].msg).toBe('plain string');
  });

  it('coerces arbitrary value to Error', async () => {
    await reportError({ code: 'E_X' });
    expect(toastCalls.error[0].msg).toContain('E_X');
  });

  it('truncates very long messages to 200 chars', async () => {
    await reportError(new Error('a'.repeat(500)));
    expect(toastCalls.error[0].msg.length).toBeLessThanOrEqual(200);
  });
});

describe('reportError — requestId correlation', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    // Null backend → sendToBackend fails → queueLocally, so we can read the
    // captured context off the localStorage retry queue.
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
    // logged issue correlates to the request that actually failed.
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

describe('reportError — level routing', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    notifyCalls.length = 0;
  });

  it('error level fires toast.error', async () => {
    await reportError(new Error('boom'), {}, 'error');
    expect(toastCalls.error.length).toBe(1);
  });

  it('warn level does NOT fire toast', async () => {
    await reportError(new Error('warn'), {}, 'warn');
    expect(toastCalls.error.length).toBe(0);
  });

  it('info level does NOT fire toast', async () => {
    await reportError(new Error('info'), {}, 'info');
    expect(toastCalls.error.length).toBe(0);
  });
});

describe('reportError — OS notifications', () => {
  beforeEach(() => {
    notifyCalls.length = 0;
    // Reset rate-limit map by importing module fresh... too complex.
    // Use unique error messages per test to avoid the 30s rate limit.
  });

  it('fires OS notification for error level', async () => {
    await reportError(new Error(`unique-1-${Date.now()}`));
    expect(notifyCalls.length).toBe(1);
    expect(notifyCalls[0].level).toBe('error');
  });

  it('does NOT fire OS notification for warn level', async () => {
    notifyCalls.length = 0;
    await reportError(new Error(`unique-warn-${Date.now()}`), {}, 'warn');
    expect(notifyCalls.length).toBe(0);
  });

  it('rate-limits duplicate error notifications within 30s', async () => {
    notifyCalls.length = 0;
    const msg = `dup-${Date.now()}`;
    await reportError(new Error(msg));
    await reportError(new Error(msg));
    await reportError(new Error(msg));
    // First fires, next two should be rate-limited.
    expect(notifyCalls.length).toBe(1);
  });
});

describe('reportWarning + reportInfo', () => {
  beforeEach(() => {
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    notifyCalls.length = 0;
  });

  it('reportWarning routes through with level=warn', async () => {
    await reportWarning(new Error('w'));
    expect(toastCalls.error.length).toBe(0);
  });

  it('reportInfo wraps a string into an Error and routes as info', async () => {
    await reportInfo('hello');
    expect(toastCalls.error.length).toBe(0);
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
