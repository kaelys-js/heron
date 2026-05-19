/** Better Auth Svelte client singleton (reactive session, passkey /
 *  GitHub OAuth / invite-code sign-in, /settings passkey add, sign-out).
 *  Web: httpOnly same-origin cookies. Native (Capacitor): WebView
 *  origin differs from backend, so we use `bearer()`. customFetchImpl
 *  captures `Set-Auth-Token`, stores it in Preferences, attaches it
 *  as `Authorization: Bearer ...` on subsequent requests. Same code
 *  path on web -- inert because Preferences is empty. */
import { createAuthClient } from 'better-auth/svelte';
import { passkeyClient } from '@better-auth/passkey/client';
import { Preferences } from '@capacitor/preferences';
import { getApiBase } from './api-base';
import { setSharedBearerToken, clearAllSharedState } from './native-bridge';
import { BRAND_STORAGE_KEYS } from './brand';

// Pulled from the centralised brand-storage map so a brand rename
// retargets every read + write in one place. Was previously hardcoded
// `'heron:bearer-token'` which would drift on rebrand.
const BEARER_KEY = BRAND_STORAGE_KEYS.bearerToken;
const AUTHED_KEY = BRAND_STORAGE_KEYS.authed;

/**
 * Better Auth validates `baseURL` synchronously and throws
 *   "Invalid base URL: …. URL must include 'http://' or 'https://'"
 * if it isn't an http(s) URL. In the Capacitor WebView our origin is
 * `heron://localhost`, which inferring from window.location.origin
 * would supply. That throw becomes an unhandled promise rejection, the
 * WebView treats the page as crashed, reloads, and we get a continuous
 * reload loop (~9 reloads/sec).
 *
 * Substitute `http://localhost` whenever the origin isn't already http(s).
 * The actual API calls don't use this baseURL -- they route through
 * `customFetchImpl` below -- so the placeholder is purely to keep
 * better-auth's validator happy.
 */
function safeBaseURL(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const origin = window.location.origin;
  if (origin.startsWith('http://') || origin.startsWith('https://')) return origin;
  return 'http://localhost';
}

/**
 * Custom fetch -- every auth-client HTTP call goes through here so both:
 *   1. Relative URLs get prepended with the resolved backend base URL
 *      (so `/api/auth/sign-in/passkey` actually reaches the server on
 *      Capacitor), and
 *   2. Bearer tokens flow in and out (capture from Set-Auth-Token on
 *      sign-in responses; replay as Authorization on every subsequent
 *      auth call so `useSession()` etc. work).
 */
/** One-shot invite-code slot. The /signup page sets this BEFORE
 *  invoking authClient.signUp.email, customFetch reads it on the
 *  next /api/auth/sign-up/* call and attaches the `x-invite-code`
 *  header so the server-side `signupGate` in hooks.server.ts can
 *  enforce single-use redemption. After consumption (one signup
 *  call), the slot is cleared so a stale code can't leak into a
 *  subsequent unrelated request. */
let _pendingInviteCode: string | null = null;
export function setPendingInviteCode(code: string | null): void {
  _pendingInviteCode = code;
}

async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const base = await getApiBase().catch(() => '');
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
  const fullUrl = rawUrl.startsWith('http') ? rawUrl : base + rawUrl;

  // Pull token from Preferences (Capacitor) with a localStorage fallback.
  let token: string | null = null;
  try {
    const { value } = await Preferences.get({ key: BEARER_KEY });
    token = value;
  } catch {
    /* Preferences not wired (web only) -- try localStorage */
  }
  if (!token && typeof localStorage !== 'undefined') {
    token = localStorage.getItem(BEARER_KEY);
  }

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Attach the pending invite code on signup requests so the
  // server-side signupGate can enforce single-use redemption.
  // Clear the slot after attaching so the code never replays.
  if (_pendingInviteCode && rawUrl.includes('/api/auth/sign-up/')) {
    headers.set('x-invite-code', _pendingInviteCode);
    _pendingInviteCode = null;
  }

  const res = await fetch(fullUrl, {
    ...init,
    headers,
    // Web keeps cookie-auth working alongside bearer; native is harmless
    // because the WebView never has a cookie for the backend origin.
    credentials: 'include',
  });

  // Capture `Set-Auth-Token` from sign-in/sign-up responses. Better-auth's
  // bearer() plugin emits this header on every successful auth response.
  const setToken = res.headers.get('set-auth-token');
  if (setToken) {
    try {
      await Preferences.set({ key: BEARER_KEY, value: setToken });
    } catch {
      /* fall through to localStorage */
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BEARER_KEY, setToken);
      // Also flip the client-side gate flag -- relevant on Capacitor where
      // +layout.svelte's localStorage check is the only auth gate (the
      // server-side hooks.server.ts doesn't run for adapter-static).
      // Both signals get cleared together in `clearLocalAuthState()`.
      localStorage.setItem(AUTHED_KEY, '1');
    }
    // Mirror into App Group UserDefaults so the Share Extension can
    // attach Authorization headers when it POSTs shared URLs. The
    // extension can't read Capacitor Preferences (different sandbox)
    // so the App Group is the only path. No-op on web/desktop.
    void setSharedBearerToken(setToken);
  }

  return res;
}

export const authClient = createAuthClient({
  baseURL: safeBaseURL(),
  plugins: [passkeyClient()],
  fetchOptions: { customFetchImpl: customFetch },
});

export const { signIn, signOut, signUp, useSession, getSession, passkey } = authClient;

/** Convenience helpers for login + logout pages so we have a single place
 *  that knows about the bearer-token / authed-flag pair.
 *
 *  Multi-user safety (F2/F4): this is the single source of truth for
 *  scrubbing every piece of local + shared state keyed to the previous
 *  user, so the same device can host multiple users without leaking
 *  data between them. The function tears down THREE layers:
 *
 *    1. Capacitor Preferences (WebView's secure store) -- bearer token
 *    2. localStorage (web + iOS WebView fallback) -- bearer + heron:authed
 *    3. App Group UserDefaults (shared across host app, Share Extension,
 *       Watch, Widgets, BackgroundFetcher) -- bearer + spotlight index +
 *       quiet hours + last-seen-issue cursor. Delegated to
 *       NativePlugin.clearAllSharedState() which is the swift-side single
 *       source of truth.
 *
 *  Widgets are scrubbed separately by `updateWidgets({authenticated:false})`
 *  fired from the layout +effect when `heron:authed` drops.
 */
export async function clearLocalAuthState(): Promise<void> {
  try {
    await Preferences.remove({ key: BEARER_KEY });
  } catch {
    /* Preferences unavailable on web */
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(BEARER_KEY);
    localStorage.removeItem(AUTHED_KEY);
  }
  // Defence in depth: clearAllSharedState wipes ALL user-scoped App Group
  // keys in one Swift round-trip (bearer + quiet hours + last-seen-issue
  // + spotlight index). The setSharedBearerToken(null) call below is a
  // belt-and-suspenders fallback for older native builds shipped before
  // clearAllSharedState() landed -- it's harmless to call both. No-op on
  // web/desktop.
  void clearAllSharedState();
  void setSharedBearerToken(null);
  // Wipe the offline-read cache so the next user can't see the previous
  // user's last-known data when signing in on a shared device. Lazy
  // import to keep the static graph minimal (this module is leaf-y).
  void import('$lib/client/offline-cache')
    .then(({ clearCache }) => clearCache())
    .catch(() => {
      /* best-effort -- IndexedDB may be unavailable (Safari private mode etc.) */
    });
}

export function markLocallyAuthed(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTHED_KEY, '1');
  }
}
