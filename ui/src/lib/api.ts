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
import { BRAND_EVENTS } from '$lib/client/brand';
import { onlineStore, OfflineError } from '$lib/client/online-status.svelte';
import { getApiBase } from '$lib/client/api-base';
import { Preferences } from '@capacitor/preferences';
import { BRAND_STORAGE_KEYS } from '$lib/client/brand';

/** Capacitor Preferences + localStorage key for the bearer token —
 *  Set-Auth-Token from /api/auth/* responses lives here so cross-
 *  origin native sessions persist across reloads. Pulled from
 *  BRAND_STORAGE_KEYS so the key tracks brand renames. */
const BEARER_KEY = BRAND_STORAGE_KEYS.bearerToken;
const AUTHED_KEY = BRAND_STORAGE_KEYS.authed;

/** Module-local guard so a flood of in-flight requests that all 401
 *  after a session lapse only triggers ONE scrub + ONE redirect. The
 *  flag is reset by the redirect (full page nav clears module state). */
let sessionExpiryHandled = false;

async function getBearerToken(): Promise<string | null> {
  // Preferences first (Capacitor-backed Keychain on iOS, SharedPreferences
  // on Android, localStorage on web). Falls back to plain localStorage so
  // the very first call before Preferences resolves doesn't miss the token.
  try {
    const { value } = await Preferences.get({ key: BEARER_KEY });
    if (value) return value;
  } catch {
    /* Preferences not available — fall through to localStorage */
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(BEARER_KEY);
  }
  return null;
}

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
    window.dispatchEvent(new CustomEvent(BRAND_EVENTS.openNotifications));
  }
}

type ErrorEnvelope = { message?: string; code?: string; details?: unknown };
type ResponseBody = { ok?: boolean; error?: ErrorEnvelope | string; message?: string };

export async function apiCall<T = any>(url: string, opts: ApiCallOpts = {}): Promise<T> {
  const { successToast, silent, inlineError, ...init } = opts;

  // Offline short-circuit — option (a) per design: never speculatively fire
  // mutations or reads when offline. The OfflineIndicator banner already
  // tells the user; throwing OfflineError lets callers branch cleanly.
  // Probe re-runs every 15s + on `window.online` event, so as soon as
  // connectivity returns subsequent calls go through normally.
  if (!onlineStore.online) {
    if (!silent && !inlineError) {
      toast.warning('Offline', {
        description: 'Reconnect to send this request.',
        duration: 4_000,
      });
    }
    throw new OfflineError();
  }

  // Resolve the API base. On web (any http(s) origin) this is '' and fetch
  // keeps using a relative path. On Capacitor the backend-discovery
  // resolver (mDNS / Tailscale / localhost) supplies the absolute URL so
  // `/api/health` becomes `http://192.168.x.x:5173/api/health`.
  let base = '';
  try {
    base = await getApiBase();
  } catch (e: any) {
    if (!silent && !inlineError) {
      toast.error("Can't reach the backend", {
        description: 'Backend discovery failed. Open settings to retry.',
        duration: 10_000,
      });
    }
    throw new ApiError(e?.message || 'Backend not found', {
      status: 0,
      code: 'BACKEND_NOT_FOUND',
    });
  }
  const fullUrl = url.startsWith('http') ? url : base + url;

  // Bearer token — set by better-auth's bearer plugin after sign-in. On
  // web cookie-auth still works, so the Authorization header is a no-op
  // there (the server reads whichever wins). On native it's the only
  // session signal that survives the WebView's foreign origin.
  const token = await getBearerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...init,
      headers,
      // `credentials: 'include'` so web keeps sending the cookie alongside
      // the bearer token. Server picks whichever path matches.
      credentials: 'include',
    });
  } catch (e: any) {
    const message = e?.message || 'Network request failed';
    if (!silent && !inlineError) {
      toast.error('Network error', {
        description: fullUrl + ' — ' + message,
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

    // F8 — session expiry: if the server says 401 AND we previously
    // marked the client as locally-authed, the session lapsed under us.
    // Scrub every local + App Group signal and bounce to /login so:
    //   • the Share Extension can't keep posting with the stale bearer
    //   • Spotlight stops surfacing the previous user's job index
    //   • the BackgroundFetcher stops honouring stale quiet hours
    //   • widgets gate themselves via the layout +effect once
    //     heron:authed drops
    // Guarded by a module-local flag so a fan-out of in-flight requests
    // that all 401 only triggers ONE scrub + ONE redirect. The full-page
    // nav at the end resets module state on the next load.
    //
    // Why check authed FIRST: a 401 on /api/auth/sign-in/* (bad creds)
    // hits this path too but the user wasn't logged in. We only want to
    // bounce session-expiry cases, not invalid-creds cases.
    if (
      response.status === 401 &&
      !sessionExpiryHandled &&
      typeof window !== 'undefined' &&
      localStorage.getItem(AUTHED_KEY) === '1'
    ) {
      sessionExpiryHandled = true;
      // Surface a sticky toast — the user needs to know why they're on
      // /login. Sign-out flows go through their own UI so this only
      // fires on involuntary expiry.
      toast.warning('Your session expired', {
        description: 'Please sign in again to continue.',
        duration: 12_000,
      });
      // Dynamic import to keep the static import graph acyclic:
      // auth-client.ts → native-bridge.ts → api-base.ts; api.ts already
      // sits at the leaf of that tree.
      void import('$lib/client/auth-client')
        .then(({ clearLocalAuthState }) => clearLocalAuthState())
        .catch(() => {
          // Best-effort scrub: even if the dynamic import fails (e.g.
          // chunk eviction), still wipe what we can from THIS module.
          try {
            localStorage.removeItem(BEARER_KEY);
            localStorage.removeItem(AUTHED_KEY);
          } catch {
            /* localStorage unavailable */
          }
        })
        .finally(() => {
          // Hard nav — clears in-memory store state, SvelteKit's session
          // load fns, and any pending fetches that would race the scrub.
          // Skip if we're already on /login to avoid a redirect loop.
          if (!window.location.pathname.startsWith('/login')) {
            window.location.assign('/login');
          }
        });
    }

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
