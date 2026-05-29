/**
 * API helpers for consistent ok/error envelope and centralized try/catch.
 *
 * Every endpoint should return either:
 *   { ok: true, ...data }                                -- success
 *   { ok: false, error: { message, code?, details? } }   -- failure
 *
 * @module
 */

import { json, isHttpError } from '@sveltejs/kit';
import { logEvent, reportServerError } from './events';

export type ApiOk<T = unknown> = { ok: true } & T;
export type ApiErr = {
  ok: false;
  error: { message: string; code?: string; details?: unknown };
};

/** Return a 200 success envelope. Spreads `data` into `{ ok: true, ...data }`. */
export function okJson<T extends object>(data: T = {} as T): Response {
  return json({ ok: true, ...data });
}

/** Return a structured error envelope with the given HTTP status. */
export function errJson(
  message: string,
  opts: { status?: number; code?: string; details?: unknown } = {},
): Response {
  const { status = 500, code, details } = opts;
  return json({ ok: false, error: { message, code, details } }, { status });
}

/**
 * Throw a 400 Bad Request that the wrap() helper converts to an envelope.
 * Use for input validation failures.
 */
export function badRequest(message: string, details?: unknown): never {
  const err: any = new Error(message);
  err.status = 400;
  err.body = { message, code: 'BAD_REQUEST', details };
  throw err;
}

type Handler<E = any> = (event: E) => Promise<Response | object | void> | Response | object | void;

/**
 * Wrap a SvelteKit endpoint with try/catch + auto-envelope.
 * - If the handler returns a Response, it's returned as-is.
 * - If it returns plain data, it's wrapped in okJson({ ...data }).
 * - Errors are caught, logged to the event bus, and returned as errJson.
 */
export function wrap<E = any>(source: string, handler: Handler<E>): Handler<E> {
  return (async (event: any) => {
    try {
      const result = await handler(event);
      if (result instanceof Response) {
        return result;
      }
      return okJson((result ?? {}) as object);
    } catch (e: any) {
      const url = event?.url?.pathname ?? '?';
      const looksHttp =
        isHttpError(e) || (e && typeof e === 'object' && 'status' in e && 'body' in e);
      if (looksHttp) {
        const status: number = e.status ?? 500;
        const body = (e.body ?? {}) as { message?: string; code?: string; details?: unknown };
        const message = body.message || 'Bad request';
        // 4xx: warn-level log, no stack (validation noise)
        // 5xx: full error reporter with stack
        if (status >= 500) {
          reportServerError(source, `[${status}] ${url}`, e, { category: 'api' });
        } else {
          logEvent(source, `[${status}] ${url}`, {
            level: 'warn',
            category: 'api',
            message,
          });
        }
        return errJson(message, { status, code: body.code, details: body.details });
      }
      reportServerError(source, `[500] ${url}`, e, { category: 'api' });
      const message = e?.message || String(e);
      return errJson(message, { status: 500, code: 'INTERNAL' });
    }
  }) as Handler<E>;
}
