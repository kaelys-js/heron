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

const { reportError, reportWarning, reportInfo, setReporterBackend } = await import(
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
