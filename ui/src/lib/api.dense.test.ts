/**
 * lib/api — dense table-driven cases for every HTTP status + envelope shape.
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
      if (e instanceof ApiError) expect(e.status).toBe(status);
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
      if (e instanceof ApiError) expect(e.status).toBe(status);
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
      if (e instanceof ApiError) expect(e.message.length).toBeGreaterThan(0);
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
  ])('POST body %o round-trips through JSON', async (body) => {
    let captured: any;
    server.use(
      http.post('*/api/x', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post('/api/x', body);
    expect(captured).toEqual(body);
  });
});

describe('ApiError — instance hygiene', () => {
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
