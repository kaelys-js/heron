/**
 * lib/server/api-helpers — dense status-code / envelope matrix.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { okJson, errJson, badRequest, wrap } = await import('./api-helpers');

describe('okJson — accepts any data shape', () => {
  it.each([
    [{ value: 1 }],
    [{ name: 'jane', age: 30 }],
    [{ nested: { a: 1 } }],
    [{ list: [1, 2, 3] }],
    [{ boolFalse: false }],
    [{ nullVal: null }],
    [{}],
  ])('shape %o', async (data) => {
    const body = await okJson(data).json();
    expect(body.ok).toBe(true);
    for (const [k, v] of Object.entries(data)) {
      expect(body[k]).toEqual(v);
    }
  });
});

describe('errJson — every status code', () => {
  it.each([400, 401, 403, 404, 409, 422, 429, 500, 502, 503])('status %i', async (status) => {
    const r = errJson('m', { status });
    expect(r.status).toBe(status);
    const body = await r.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe('m');
  });
});

describe('errJson — code preservation', () => {
  it.each([
    'NETWORK',
    'BACKEND_NOT_FOUND',
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'INTERNAL',
    'E_CUSTOM',
  ])('code %s', async (code) => {
    const body = await errJson('m', { status: 400, code }).json();
    expect(body.error.code).toBe(code);
  });
});

describe('errJson — details preservation', () => {
  it.each([
    [{ hint: 'fix it' }],
    [{ field: 'name' }],
    [{ nested: { a: 1, b: 2 } }],
    [['arr', 'of', 'strings']],
    [null],
    ['plain-string'],
    [42],
  ])('details %o', async (details) => {
    const body = await errJson('m', { status: 400, details }).json();
    if (details !== null && details !== undefined) {
      expect(body.error.details).toEqual(details);
    }
  });
});

describe('badRequest — throws with expected shape', () => {
  it.each([
    'missing url',
    'invalid email',
    'too many requests',
    'required field absent',
    'malformed JSON',
  ])('message %s', (msg) => {
    try {
      badRequest(msg);
      throw new Error('did not throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.body.message).toBe(msg);
      expect(e.body.code).toBe('BAD_REQUEST');
    }
  });
});

describe('wrap — every handler return shape', () => {
  it.each([
    [{ value: 1 }],
    [{ name: 'a', age: 30 }],
    [{ array: [1, 2, 3] }],
    [{}],
    [undefined],
    [null],
  ])('handler returns %o → ok envelope', async (data) => {
    const h = wrap('test', () => data as any);
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    const body = await r.json();
    expect(body.ok).toBe(true);
  });
});

describe('wrap — caught errors → envelope', () => {
  it.each([
    ['plain Error', new Error('boom')],
    ['custom Error subclass', Object.assign(new Error('x'), { name: 'CustomError' })],
    ['string thrown', 'string error'],
  ] as const)('catches %s', async (_label, err) => {
    const h = wrap('test', () => {
      throw err;
    });
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    const body = await r.json();
    expect(body.ok).toBe(false);
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
