/**
 * lib/server/api-helpers -- okJson, errJson, badRequest, wrap.
 *
 * Tests the envelope shape contract every endpoint relies on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { okJson, errJson, badRequest, wrap } = await import('./api-helpers');

describe('okJson', () => {
  it('produces { ok: true, ...data }', async () => {
    const r = okJson({ value: 42 });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ ok: true, value: 42 });
  });

  it('accepts empty data', async () => {
    const body = await okJson().json();
    expect(body).toEqual({ ok: true });
  });

  it('returns a Response object', () => {
    expect(okJson()).toBeInstanceOf(Response);
  });
});

describe('errJson', () => {
  it('default status is 500', async () => {
    const r = errJson('boom');
    expect(r.status).toBe(500);
  });

  it('embeds message + code + details', async () => {
    const body = await errJson('boom', { status: 400, code: 'X', details: { hint: 'h' } }).json();
    expect(body).toEqual({
      ok: false,
      error: { message: 'boom', code: 'X', details: { hint: 'h' } },
    });
  });

  it('omits code/details when not provided', async () => {
    const body = await errJson('boom').json();
    expect(body.error.code).toBeUndefined();
    expect(body.error.details).toBeUndefined();
  });
});

describe('badRequest', () => {
  it('throws an error with status=400', () => {
    try {
      badRequest('missing url');
      throw new Error('did not throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.body.message).toBe('missing url');
      expect(e.body.code).toBe('BAD_REQUEST');
    }
  });

  it('attaches details', () => {
    try {
      badRequest('x', { field: 'name' });
    } catch (e: any) {
      expect(e.body.details).toEqual({ field: 'name' });
    }
  });
});

describe('wrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps plain return into ok envelope', async () => {
    const h = wrap('test', () => ({ value: 1 }));
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    const body = await r.json();
    expect(body).toEqual({ ok: true, value: 1 });
  });

  it('passes through a Response untouched', async () => {
    const custom = new Response('{}', { status: 201 });
    const h = wrap('test', () => custom);
    const r = await h({ url: { pathname: '/x' } } as any);
    expect(r).toBe(custom);
  });

  it('catches badRequest → envelope with 400', async () => {
    const h = wrap('test', () => {
      badRequest('bad input');
    });
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.message).toBe('bad input');
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('catches unhandled error → 500 envelope', async () => {
    const h = wrap('test', () => {
      throw new Error('totally broken');
    });
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error.message).toBe('totally broken');
    expect(body.error.code).toBe('INTERNAL');
  });

  it('handles async handlers', async () => {
    const h = wrap('test', async () => ({ value: 'async' }));
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    const body = await r.json();
    expect(body.value).toBe('async');
  });

  it('handles undefined return → empty success', async () => {
    const h = wrap('test', () => undefined);
    const r = (await h({ url: { pathname: '/x' } } as any)) as Response;
    const body = await r.json();
    expect(body).toEqual({ ok: true });
  });
});
