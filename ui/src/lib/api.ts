/**
 * Central client fetch wrapper.
 * - Always returns parsed JSON (or throws)
 * - Auto-toasts on network failure + 4xx/5xx with longer dismiss + Details action
 * - Optional success toast for mutations
 * - Surfaces structured `{ ok: false, error: { message, code?, details? } }` envelopes
 *
 * Thrown error type: ApiError (status, code?, details?, data?).
 *
 * @module
 */

import { toast } from 'svelte-sonner';

export type ApiCallOpts = RequestInit & {
  successToast?: string | { title: string; description?: string };
  /** Skip auto-toast entirely. */
  silent?: boolean;
  /** Skip auto-toast; caller wants to render its own UI for the error. */
  inlineError?: boolean;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  data?: unknown;
  constructor(
    message: string,
    init: { status: number; code?: string; details?: unknown; data?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.data = init.data;
  }
}

function dispatchOpenNotifications(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('career-ops:open-notifications'));
  }
}

type ErrorEnvelope = { message?: string; code?: string; details?: unknown };
type ResponseBody = { ok?: boolean; error?: ErrorEnvelope | string; message?: string };

export async function apiCall<T = any>(url: string, opts: ApiCallOpts = {}): Promise<T> {
  const { successToast, silent, inlineError, ...init } = opts;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (e: any) {
    const message = e?.message || 'Network request failed';
    if (!silent && !inlineError) {
      toast.error('Network error', {
        description: url + ' — ' + message,
        duration: 10_000,
      });
    }
    throw new ApiError(message, { status: 0, code: 'NETWORK' });
  }

  let data: ResponseBody | null = null;
  try {
    data = (await response.json()) as ResponseBody;
  } catch {
    // body wasn't JSON
  }

  const envelope: ErrorEnvelope | undefined =
    data && typeof data.error === 'object' && data.error !== null
      ? (data.error as ErrorEnvelope)
      : undefined;
  const failed = !response.ok || data?.ok === false;

  if (failed) {
    const fallbackError = typeof data?.error === 'string' ? data.error : undefined;
    const message =
      envelope?.message ||
      data?.message ||
      fallbackError ||
      response.statusText ||
      'Request failed';
    const code = envelope?.code;
    const details = envelope?.details;
    if (!silent && !inlineError) {
      toast.error(message, {
        description: response.status + ' · ' + url,
        duration: 10_000,
        action: {
          label: 'Details',
          onClick: () => dispatchOpenNotifications(),
        },
      });
    }
    throw new ApiError(message, { status: response.status, code, details, data });
  }

  if (successToast) {
    if (typeof successToast === 'string') {
      toast.success(successToast);
    } else {
      toast.success(successToast.title, { description: successToast.description });
    }
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string, opts?: ApiCallOpts) => apiCall<T>(url, { ...opts, method: 'GET' }),
  post: <T = any>(url: string, body?: any, opts?: ApiCallOpts) =>
    apiCall<T>(url, { ...opts, method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(url: string, body?: any, opts?: ApiCallOpts) =>
    apiCall<T>(url, { ...opts, method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T = any>(url: string, opts?: ApiCallOpts) =>
    apiCall<T>(url, { ...opts, method: 'DELETE' }),
};
