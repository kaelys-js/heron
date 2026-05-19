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
import {
  enqueueForRetry,
  isRetryable,
  register as registerAbort,
  unregister as unregisterAbort,
} from '$lib/client/network-resilience';
import { getCached, isCacheable, setCached } from '$lib/client/offline-cache';

/** Capacitor Preferences + localStorage key for the bearer token --
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
    /* Preferences not available -- fall through to localStorage */
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
  /** Opt this request into the auto-retry queue. Default: GETs auto-opt-in,
   *  mutations (POST/PUT/PATCH/DELETE) opt OUT (idempotency risk -- see
   *  network-resilience.ts). Pass `retryable: true` to force a mutation
   *  into the queue when you know it's idempotent server-side. */
  retryable?: boolean;
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
  const { successToast, silent, inlineError, retryable, ...init } = opts;

  // Offline short-circuit -- never speculatively fire mutations when
  // offline. For cacheable GETs we can serve last-known data from
  // IndexedDB instead so authed users keep functioning behind a
  // dismissed BackendUnreachableOverlay.
  if (!onlineStore.online) {
    const method = (init.method ?? 'GET').toUpperCase();
    if (method === 'GET' && isCacheable(url)) {
      const cached = await getCached<T>(url);
      if (cached) {
        // Silently serve cached. The OfflineIndicator pill already
        // tells the user they're offline; cache hits don't need their
        // own toast.
        return cached.data;
      }
    }
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

  // Bearer token -- set by better-auth's bearer plugin after sign-in. On
  // web cookie-auth still works, so the Authorization header is a no-op
  // there (the server reads whichever wins). On native it's the only
  // session signal that survives the WebView's foreign origin.
  const token = await getBearerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // AbortController registration -- the network-resilience module fires
  // ctrl.abort() on every in-flight request when iOS NWPathMonitor
  // reports offline, so fetches don't hang on the OS TCP timeout. Caller-
  // supplied signals are bridged by register() so caller-side timeouts
  // still work.
  const ctrl = registerAbort({ ...init, signal: init.signal });
  const fetchInit: RequestInit = {
    ...init,
    headers,
    credentials: 'include',
    signal: ctrl.signal,
  };

  let response: Response;
  try {
    response = await fetch(fullUrl, fetchInit);
  } catch (e: any) {
    unregisterAbort(ctrl);
    const aborted = e?.name === 'AbortError';
    const message = aborted ? 'Network dropped' : e?.message || 'Network request failed';
    // Offline-cache fallback: if this was a cacheable GET, serve the
    // last-known value before either retrying or surfacing the error.
    // Auth'd users keep seeing their dashboard behind a dismissed
    // BackendUnreachableOverlay (M9). The retry queue (below) also
    // fires when the network recovers -- so cache + retry stack: user
    // gets stale data NOW, fresh data when network returns.
    const method = (fetchInit.method ?? 'GET').toUpperCase();
    if (method === 'GET' && isCacheable(url)) {
      const cached = await getCached<T>(url);
      if (cached) {
        // Still enqueue for retry so the cache refreshes when the
        // network recovers -- but resolve to the cached snapshot NOW.
        if (isRetryable(fetchInit, retryable)) {
          enqueueForRetry({
            url: fullUrl,
            init: { ...fetchInit, signal: undefined },
            resolve: async (replayResponse) => {
              try {
                const fresh = (await replayResponse.json()) as ResponseBody;
                if (replayResponse.ok && fresh && fresh.ok !== false) {
                  void setCached(url, fresh);
                }
              } catch {
                /* cache refresh is best-effort */
              }
            },
            reject: () => {
              /* swallow -- caller already has cached snapshot */
            },
          });
        }
        return cached.data;
      }
    }
    // Auto-retry on network recovery for safe / opted-in requests.
    // We resolve the caller's promise from the retry's result so the
    // calling code never sees the transient failure.
    if (isRetryable(fetchInit, retryable)) {
      return new Promise<T>((resolve, reject) => {
        enqueueForRetry({
          url: fullUrl,
          init: { ...fetchInit, signal: undefined }, // fresh signal on replay
          resolve: async (replayResponse) => {
            try {
              const data = (await replayResponse.json()) as ResponseBody;
              if (!replayResponse.ok || data?.ok === false) {
                const env = data && typeof data.error === 'object' ? data.error : undefined;
                const msg =
                  (env as ErrorEnvelope)?.message ||
                  data?.message ||
                  replayResponse.statusText ||
                  'Request failed';
                reject(new ApiError(msg, { status: replayResponse.status }));
                return;
              }
              if (method === 'GET') void setCached(url, data);
              resolve(data as T);
            } catch (parseErr) {
              reject(parseErr);
            }
          },
          reject: (err) => {
            // Retry also failed -- surface the error like the original
            // failure would have. Caller's catch sees the same shape.
            const finalMsg = err instanceof Error ? err.message : String(err);
            reject(new ApiError(finalMsg, { status: 0, code: 'NETWORK' }));
          },
        });
      });
    }
    if (!silent && !inlineError) {
      // For non-retryable failures (mutations, opt-outs), show a clear
      // toast with the URL so the user knows what was lost.
      const description = aborted ? url : fullUrl + ' — ' + message;
      toast.error(aborted ? 'Network dropped — request cancelled' : 'Network error', {
        description,
        duration: 10_000,
      });
    }
    throw new ApiError(message, { status: 0, code: aborted ? 'ABORTED' : 'NETWORK' });
  }
  unregisterAbort(ctrl);

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

    // F8 -- session expiry: if the server says 401 AND we previously
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
      // Surface a sticky toast -- the user needs to know why they're on
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
          // Hard nav -- clears in-memory store state, SvelteKit's session
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
  // Write-through to the offline cache for cacheable GETs. Fire-and-
  // forget -- the cache is a fallback, never blocking the request path.
  const method = (fetchInit.method ?? 'GET').toUpperCase();
  if (method === 'GET' && data && isCacheable(url)) {
    void setCached(url, data);
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
