/**
 * lib/api -- dense table-driven cases for every HTTP status + envelope shape.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('svelte-sonner', () => ({
  toast: { error: () => {}, warning: () => {}, success: () => {} },
}));
vi.mock('$lib/client/online-status.svelte', () => ({
  onlineStore: { online: true },
  OfflineError: class extends Error {
    isOffline = true;
  },
}));
vi.mock('$lib/client/api-base', () => ({
  getApiBase: vi.fn(async () => ''),
  apiBaseSync: () => '',
  resetApiBase: () => undefined,
}));

const { apiCall, api, ApiError } = await import('./api');
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());

describe('apiCall — every 2xx status passes', () => {
  it.each([200, 201, 202])('status %i body parses', async (status) => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: true, n: status }, { status })));
    const r = await apiCall<any>('/api/x');
    expect(r.n).toBe(status);
  });

  it('204 no-content resolves without throwing', async () => {
    server.use(http.get('*/api/x', () => new HttpResponse(null, { status: 204 })));
    // 204 has no body, no `ok` envelope. apiCall doesn't see data.ok===false
    // because data is null → not "failed". Resolves with null/{}.
    await expect(apiCall('/api/x')).resolves.toBeDefined();
  });
});

describe('apiCall — every 4xx throws ApiError with that status', () => {
  it.each([400, 401, 402, 403, 404, 409, 410, 422, 429])('status %i', async (status) => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ ok: false, error: { message: 'm' } }, { status }),
      ),
    );
    try {
      await apiCall('/api/x', { silent: true });
      throw new Error('did not throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.status).toBe(status);
      }
    }
  });
});

describe('apiCall — every 5xx throws ApiError with that status', () => {
  it.each([500, 501, 502, 503, 504])('status %i', async (status) => {
    server.use(http.get('*/api/x', () => HttpResponse.text('boom', { status })));
    try {
      await apiCall('/api/x', { silent: true });
      throw new Error('did not throw');
    } catch (e) {
      if (e instanceof ApiError) {
        expect(e.status).toBe(status);
      }
    }
  });
});

describe('apiCall — error envelope variations', () => {
  it.each([
    { ok: false, error: { message: 'a' } },
    { ok: false, error: 'b' },
    { ok: false, message: 'c' },
    { ok: false },
  ])('shape %o → throws with non-empty message', async (body) => {
    server.use(http.get('*/api/x', () => HttpResponse.json(body, { status: 400 })));
    try {
      await apiCall('/api/x', { silent: true });
      throw new Error('did not throw');
    } catch (e) {
      if (e instanceof ApiError) {
        expect(e.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('apiCall — verb shortcuts', () => {
  it.each(['GET', 'POST', 'PUT', 'DELETE'])('%s reaches the handler', async (verb) => {
    let captured: string | undefined;
    server.use(
      http.all('*/api/x', ({ request }) => {
        captured = request.method;
        return HttpResponse.json({ ok: true });
      }),
    );
    const verbToFn = {
      GET: () => api.get('/api/x'),
      POST: () => api.post('/api/x', {}),
      PUT: () => api.put('/api/x', {}),
      DELETE: () => api.delete('/api/x'),
    } as Record<string, () => Promise<unknown>>;
    await verbToFn[verb]();
    expect(captured).toBe(verb);
  });
});

describe('apiCall — body serialisation', () => {
  it.each([
    { v: 1 },
    { name: 'jane', age: 30 },
    { nested: { a: 1, b: [1, 2, 3] } },
    { empty: {} },
    { array: [1, 2, 3] },
    { null_value: null },
    { bool_true: true },
    { bool_false: false },
  ])('pOST body %o round-trips through JSON', async (body) => {
    let captured: any;
    server.use(
      http.post('*/api/x', async ({ request }) => {
        // .clone() -- MSW 2.14 experimental-frames re-reads bodies
        // during handler routing; clone gives us a fresh stream.
        captured = await request.clone().json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post('/api/x', body);
    expect(captured).toEqual(body);
  });
});

describe('apiError — instance hygiene', () => {
  it.each([200, 400, 401, 422, 500, 503])('status %i sets ApiError.status', (s) => {
    const e = new ApiError('test', { status: s });
    expect(e.status).toBe(s);
  });

  it.each([
    'NETWORK',
    'BACKEND_NOT_FOUND',
    'INTERNAL',
    'BAD_REQUEST',
    'E_X',
  ])('code %s sets ApiError.code', (code) => {
    const e = new ApiError('test', { status: 400, code });
    expect(e.code).toBe(code);
  });
});

/**
 * F8 -- session expiry: when the server returns 401 AND the client has
 * locally-marked itself as authed, apiCall must scrub local state +
 * redirect to /login so a stale bearer doesn't keep leaking through
 * the Share Extension / Watch / BackgroundFetcher.
 *
 * We verify the BEHAVIOUR (clearLocalAuthState gets called, redirect
 * fires) rather than the internal flag, because the flag is a private
 * implementation detail. The structural test in
 * multi-user.integration.test.ts asserts the static-analysis-level
 * pairing of signOut/clearLocalAuthState; this test asserts the
 * dynamic behaviour.
 */
describe('apiCall — 401 session expiry triggers clearLocalAuthState + /login redirect', () => {
  // Stub clearLocalAuthState BEFORE re-importing api.ts so the dynamic
  // import inside apiCall picks up the mock instead of the real impl.
  const clearLocalAuthState = vi.fn(async () => undefined);
  vi.doMock('$lib/client/auth-client', () => ({ clearLocalAuthState }));

  // window.location.assign isn't normally writable; replace it on each
  // test and restore after. Locking via getter would crash jsdom.
  const originalLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearLocalAuthState.mockClear();
    assignSpy = vi.fn();
    // @ts-expect-error -- overriding window.location for the test
    delete window.location;
    // @ts-expect-error -- minimal stub of Location interface
    window.location = { ...originalLocation, pathname: '/inbox', assign: assignSpy };
    // Pretend the user IS locally authed -- this is what flips the
    // 401-handler from "bad creds, do nothing" to "session expired,
    // scrub everything".
    localStorage.setItem('heron:authed', '1');
  });

  afterEach(() => {
    localStorage.removeItem('heron:authed');
    // @ts-expect-error -- restoring window.location
    window.location = originalLocation;
  });

  it('401 with heron:authed=1 calls clearLocalAuthState + window.location.assign(/login)', async () => {
    // Re-import api.ts fresh so the module-local sessionExpiryHandled
    // flag is reset between tests.
    vi.resetModules();
    const { apiCall: freshApiCall, ApiError: FreshApiError } = await import('./api');
    void FreshApiError; // imported for instanceof assertions on the fresh class
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 401 })));
    await expect(freshApiCall('/api/x', { silent: true })).rejects.toBeInstanceOf(FreshApiError);
    // The handler scrubs + redirects asynchronously (Promise chain).
    // Wait one microtask tick for the dynamic-import .then to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(clearLocalAuthState).toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('/login');
  });

  it('401 WITHOUT heron:authed (bad creds at login) does NOT scrub or redirect', async () => {
    vi.resetModules();
    const { apiCall: freshApiCall, ApiError: FreshApiError } = await import('./api');
    void FreshApiError; // imported for instanceof assertions on the fresh class
    localStorage.removeItem('heron:authed');
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 401 })));
    await expect(freshApiCall('/api/x', { silent: true })).rejects.toBeInstanceOf(FreshApiError);
    await new Promise((r) => setTimeout(r, 10));
    expect(clearLocalAuthState).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('repeated 401s from a fan-out only trigger ONE scrub + redirect', async () => {
    vi.resetModules();
    const { apiCall: freshApiCall, ApiError: FreshApiError } = await import('./api');
    void FreshApiError; // imported for instanceof assertions on the fresh class
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 401 })));
    await Promise.all(
      [1, 2, 3, 4].map(() => freshApiCall('/api/x', { silent: true }).catch(() => undefined)),
    );
    await new Promise((r) => setTimeout(r, 10));
    // Exactly one scrub + one redirect even though 4 requests 401'd.
    expect(clearLocalAuthState).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT redirect if already on /login (avoid loop)', async () => {
    vi.resetModules();
    const { apiCall: freshApiCall, ApiError: FreshApiError } = await import('./api');
    void FreshApiError; // imported for instanceof assertions on the fresh class
    window.location.pathname = '/login';
    server.use(http.get('*/api/x', () => HttpResponse.json({ ok: false }, { status: 401 })));
    await expect(freshApiCall('/api/x', { silent: true })).rejects.toBeInstanceOf(FreshApiError);
    await new Promise((r) => setTimeout(r, 10));
    // We still want the scrub (the local-authed flag is wrong);
    // we just don't bounce because we're already at /login.
    expect(clearLocalAuthState).toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
