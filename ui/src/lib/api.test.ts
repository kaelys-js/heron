/**
 * lib/api -- apiCall + the `api.{get,post,put,delete}` convenience map.
 *
 * Uses MSW for HTTP. Mocks svelte-sonner so we can assert toast calls
 * without rendering. Mocks the online-status store to control offline
 * branches. Mocks api-base to '' so the relative URL is hit directly.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { BRAND_STORAGE_KEYS } from '$lib/client/brand';

// Mock toast -- must be hoisted before importing api.ts.
const toastCalls = {
  error: [] as any[],
  warning: [] as any[],
  success: [] as any[],
};
vi.mock('svelte-sonner', () => ({
  toast: {
    error: (msg: any, opts?: any) => {
      toastCalls.error.push({ msg, opts });
    },
    warning: (msg: any, opts?: any) => {
      toastCalls.warning.push({ msg, opts });
    },
    success: (msg: any, opts?: any) => {
      toastCalls.success.push({ msg, opts });
    },
  },
}));

// Mock onlineStore -- default online; flip per-test for offline cases.
const onlineState = { online: true };
vi.mock('$lib/client/online-status.svelte', () => ({
  onlineStore: onlineState,
  OfflineError: class OfflineError extends Error {
    constructor() {
      super('Offline');
      this.name = 'OfflineError';
    }
  },
}));

// Mock backend-discovery → resolve to empty so fetch sees relative paths.
vi.mock('$lib/client/api-base', () => ({
  getApiBase: vi.fn(async () => ''),
  apiBaseSync: () => '',
  resetApiBase: () => undefined,
}));

// Import AFTER mocks so apiCall picks them up.
const { apiCall, api, ApiError } = await import('./api');

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());

beforeEach(() => {
  toastCalls.error.length = 0;
  toastCalls.warning.length = 0;
  toastCalls.success.length = 0;
  onlineState.online = true;
});

describe('apiCall — happy path', () => {
  it('gET returns parsed JSON body', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ hello: 'world' })));
    const r = await apiCall('/api/x');
    expect(r).toEqual({ hello: 'world' });
  });

  it('uses the api.get shorthand', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: true, value: 1 })));
    const r = await api.get('/api/x');
    expect(r.value).toBe(1);
  });

  it('pOST sends JSON body', async () => {
    let captured: any;
    server.use(
      http.post('*/api/x', async ({ request }) => {
        // .clone() defends against MSW 2.14 experimental-frames body
        // re-read during multi-handler routing -- see the "Body is
        // unusable" error that surfaces when handlers added via
        // server.use() compete with a default match path.
        captured = await request.clone().json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post('/api/x', { name: 'Jane' });
    expect(captured).toEqual({ name: 'Jane' });
  });

  it('pOST with no body sends {}', async () => {
    let captured: any;
    server.use(
      http.post('*/api/x', async ({ request }) => {
        // .clone() defends against MSW 2.14 experimental-frames body
        // re-read during multi-handler routing -- see the "Body is
        // unusable" error that surfaces when handlers added via
        // server.use() compete with a default match path.
        captured = await request.clone().json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post('/api/x');
    expect(captured).toEqual({});
  });

  it('pUT sends JSON body', async () => {
    let captured: any;
    server.use(
      http.put('*/api/x', async ({ request }) => {
        // .clone() defends against MSW 2.14 experimental-frames body
        // re-read during multi-handler routing -- see the "Body is
        // unusable" error that surfaces when handlers added via
        // server.use() compete with a default match path.
        captured = await request.clone().json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.put('/api/x', { v: 2 });
    expect(captured).toEqual({ v: 2 });
  });

  it('dELETE works', async () => {
    let method: string | undefined;
    server.use(
      http.delete('*/api/x', ({ request }) => {
        ({ method } = request);
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.delete('/api/x');
    expect(method).toBe('DELETE');
  });

  it('sends Content-Type: application/json by default', async () => {
    let ct: string | null = null;
    server.use(
      http.post('*/api/x', ({ request }) => {
        ct = request.headers.get('content-type');
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post('/api/x', { a: 1 });
    expect(ct).toContain('application/json');
  });

  it('merges custom headers without dropping Content-Type', async () => {
    let xh: string | null = null;
    let ct: string | null = null;
    server.use(
      http.get('*/api/x', ({ request }) => {
        xh = request.headers.get('x-custom');
        ct = request.headers.get('content-type');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiCall('/api/x', { headers: { 'x-custom': 'foo' } });
    expect(xh).toBe('foo');
    expect(ct).toContain('application/json');
  });
});

describe('apiCall — error paths', () => {
  it('throws ApiError on 4xx with envelope.message', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ ok: false, error: { message: 'Nope' } }, { status: 400 }),
      ),
    );
    await expect(apiCall('/api/x')).rejects.toThrow('Nope');
    await expect(apiCall('/api/x', { silent: true })).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError on 5xx using statusText fallback', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.text('boom', { status: 500 })));
    await expect(apiCall('/api/x')).rejects.toThrow();
  });

  it('throws on data.ok === false even when HTTP 200', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false, message: 'soft fail' })));
    await expect(apiCall('/api/x')).rejects.toThrow('soft fail');
  });

  it('uses string-form error envelope', async () => {
    server.use(
      http.get('*/api/x', () => HttpResponse.json({ ok: false, error: 'Bad' }, { status: 422 })),
    );
    await expect(apiCall('/api/x')).rejects.toThrow('Bad');
  });

  it('extracts code + details from error envelope', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json(
          { ok: false, error: { message: 'X', code: 'E_X', details: { hint: 'fix it' } } },
          { status: 400 },
        ),
      ),
    );
    try {
      await apiCall('/api/x', { silent: true });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.code).toBe('E_X');
        expect(e.details).toEqual({ hint: 'fix it' });
      }
    }
  });

  it('captures the failing response X-Request-Id onto ApiError.requestId', async () => {
    // WHY: api.ts reads the correlation id off the response so a catch handler
    // / the error reporter can quote the EXACT failing request to support --
    // the same id the server logged + the error page shows as `· ref <id>`.
    // The CORS Expose-Headers in hooks.server.ts is what lets a cross-origin
    // client read it at all; here we assert api.ts actually plumbs it through.
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json(
          { ok: false, error: { message: 'boom' } },
          { status: 500, headers: { 'X-Request-Id': 'req-xyz-789' } },
        ),
      ),
    );
    const err = await apiCall('/api/x', { silent: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.requestId).toBe('req-xyz-789');
    }
  });

  it('leaves ApiError.requestId undefined when no X-Request-Id is present', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ ok: false, error: { message: 'boom' } }, { status: 400 }),
      ),
    );
    const err = await apiCall('/api/x', { silent: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) {
      expect(err.requestId).toBeUndefined();
    }
  });

  it('toasts on failure when silent is not set', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ ok: false, error: { message: 'nope' } }, { status: 400 }),
      ),
    );
    await expect(apiCall('/api/x')).rejects.toThrow();
    expect(toastCalls.error.length).toBe(1);
    expect(toastCalls.error[0].msg).toBe('nope');
  });

  it('suppresses toast when silent: true', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 400 })));
    await expect(apiCall('/api/x', { silent: true })).rejects.toThrow();
    expect(toastCalls.error.length).toBe(0);
  });

  it('suppresses toast when inlineError: true', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 400 })));
    await expect(apiCall('/api/x', { inlineError: true })).rejects.toThrow();
    expect(toastCalls.error.length).toBe(0);
  });

  it('exposes data on ApiError for caller introspection', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ ok: false, foo: 'bar', error: 'x' }, { status: 400 }),
      ),
    );
    try {
      await apiCall('/api/x', { silent: true });
    } catch (e) {
      if (e instanceof ApiError) {
        expect((e.data as any).foo).toBe('bar');
      }
    }
  });
});

describe('apiCall — network failures', () => {
  it('wraps fetch error in ApiError(status=0, code=NETWORK)', async () => {
    // retryable:false opts OUT of the M8 retry queue; without it, GETs
    // are auto-retried on network recovery and the promise stays
    // pending until an `online` event arrives (which the test never
    // dispatches). Production code generally wants the retry; this
    // test asserts the immediate-throw contract for explicit opt-outs.
    server.use(http.get('*/api/x', () => HttpResponse.error()));
    try {
      await apiCall('/api/x', { silent: true, retryable: false });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.status).toBe(0);
        expect(e.code).toBe('NETWORK');
      }
    }
  });

  it('shows Network error toast on fetch failure', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.error()));
    await expect(apiCall('/api/x', { retryable: false })).rejects.toThrow();
    expect(toastCalls.error.find((c) => c.msg === 'Network error')).toBeTruthy();
  });
});

describe('apiCall — offline short-circuit', () => {
  it('throws OfflineError when onlineStore.online is false', async () => {
    onlineState.online = false;
    await expect(apiCall('/api/x')).rejects.toThrow();
  });

  it('shows Offline warning toast', async () => {
    onlineState.online = false;
    await expect(apiCall('/api/x')).rejects.toThrow();
    expect(toastCalls.warning.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT show offline toast when silent', async () => {
    onlineState.online = false;
    await expect(apiCall('/api/x', { silent: true })).rejects.toThrow();
    expect(toastCalls.warning.length).toBe(0);
  });
});

describe('apiCall — success toasts', () => {
  it('shows string-form success toast', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: true })));
    await apiCall('/api/x', { successToast: 'Saved' });
    expect(toastCalls.success[0].msg).toBe('Saved');
  });

  it('shows {title, description} object-form toast', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: true })));
    await apiCall('/api/x', { successToast: { title: 'Saved', description: 'all good' } });
    expect(toastCalls.success[0].msg).toBe('Saved');
    expect(toastCalls.success[0].opts.description).toBe('all good');
  });
});

describe('apiCall — bearer token', () => {
  it('attaches Authorization: Bearer <token> when localStorage has one', async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRAND_STORAGE_KEYS.bearerToken, 'test-token-123');
    }
    let auth: string | null = null;
    server.use(
      http.get('*/api/x', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiCall('/api/x');
    expect(auth).toBe('Bearer test-token-123');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BRAND_STORAGE_KEYS.bearerToken);
    }
  });

  it('omits Authorization when no token stored', async () => {
    let auth: string | null = 'sentinel';
    server.use(
      http.get('*/api/x', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiCall('/api/x');
    expect(auth).toBeNull();
  });
});

describe('apiError class', () => {
  it('has name "ApiError"', () => {
    const e = new ApiError('test', { status: 400 });
    expect(e.name).toBe('ApiError');
  });
  it('exposes status, code, details, data', () => {
    const e = new ApiError('test', {
      status: 400,
      code: 'X',
      details: { foo: 1 },
      data: { bar: 2 },
    });
    expect(e.status).toBe(400);
    expect(e.code).toBe('X');
    expect(e.details).toEqual({ foo: 1 });
    expect(e.data).toEqual({ bar: 2 });
  });
  it('exposes the requestId correlation id', () => {
    const e = new ApiError('test', { status: 500, requestId: 'req-1' });
    expect(e.requestId).toBe('req-1');
  });
  it('is an instance of Error', () => {
    expect(new ApiError('m', { status: 0 })).toBeInstanceOf(Error);
  });
});
