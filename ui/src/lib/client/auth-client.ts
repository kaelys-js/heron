/**
 * Better Auth Svelte client singleton.
 *
 * Used by every auth-aware page (login, signup, settings, topbar) to:
 *   • Read the current session reactively (`authClient.useSession()`)
 *   • Trigger sign-in flows (passkey / GitHub OAuth / invite-code)
 *   • Add a new passkey from /settings
 *   • Sign out
 *
 * On WEB the client talks to the catch-all `/api/auth/*` route at the
 * current origin; cookies are httpOnly + same-origin and the browser
 * handles persistence automatically.
 *
 * On NATIVE (Capacitor iOS / Android) the WebView origin
 * (`careerops://localhost`) is different from the backend origin
 * (`http://<lan-ip>:5173`), so cookies can't round-trip. We swap to
 * better-auth's `bearer()` plugin: the server sets `Set-Auth-Token: <token>`
 * on every sign-in response; our customFetchImpl captures that token,
 * persists it in Capacitor Preferences, and adds it as
 * `Authorization: Bearer <token>` on every subsequent request. Same code
 * path on web — it's just inert there because Preferences is empty.
 */
import { createAuthClient } from 'better-auth/svelte';
import { passkeyClient } from '@better-auth/passkey/client';
import { Preferences } from '@capacitor/preferences';
import { getApiBase } from './api-base';

const BEARER_KEY = 'career-ops:bearer-token';

/**
 * Better Auth validates `baseURL` synchronously and throws
 *   "Invalid base URL: …. URL must include 'http://' or 'https://'"
 * if it isn't an http(s) URL. In the Capacitor WebView our origin is
 * `careerops://localhost`, which inferring from window.location.origin
 * would supply. That throw becomes an unhandled promise rejection, the
 * WebView treats the page as crashed, reloads, and we get a continuous
 * reload loop (~9 reloads/sec).
 *
 * Substitute `http://localhost` whenever the origin isn't already http(s).
 * The actual API calls don't use this baseURL — they route through
 * `customFetchImpl` below — so the placeholder is purely to keep
 * better-auth's validator happy.
 */
function safeBaseURL(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const origin = window.location.origin;
  if (origin.startsWith('http://') || origin.startsWith('https://')) return origin;
  return 'http://localhost';
}

/**
 * Custom fetch — every auth-client HTTP call goes through here so both:
 *   1. Relative URLs get prepended with the resolved backend base URL
 *      (so `/api/auth/sign-in/passkey` actually reaches the server on
 *      Capacitor), and
 *   2. Bearer tokens flow in and out (capture from Set-Auth-Token on
 *      sign-in responses; replay as Authorization on every subsequent
 *      auth call so `useSession()` etc. work).
 */
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
    /* Preferences not wired (web only) — try localStorage */
  }
  if (!token && typeof localStorage !== 'undefined') {
    token = localStorage.getItem(BEARER_KEY);
  }

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
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
      // Also flip the client-side gate flag — relevant on Capacitor where
      // +layout.svelte's localStorage check is the only auth gate (the
      // server-side hooks.server.ts doesn't run for adapter-static).
      // Both signals get cleared together in `clearLocalAuthState()`.
      localStorage.setItem('career-ops:authed', '1');
    }
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
 *  that knows about the bearer-token / authed-flag pair. */
export async function clearLocalAuthState(): Promise<void> {
  try {
    await Preferences.remove({ key: BEARER_KEY });
  } catch {
    /* Preferences unavailable on web */
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(BEARER_KEY);
    localStorage.removeItem('career-ops:authed');
  }
}

export function markLocallyAuthed(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('career-ops:authed', '1');
  }
}
