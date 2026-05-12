/**
 * Better Auth Svelte client singleton.
 *
 * Used by every auth-aware page (login, signup, settings, topbar) to:
 *   • Read the current session reactively (`authClient.useSession()`)
 *   • Trigger sign-in flows (passkey / GitHub OAuth / invite-code)
 *   • Add a new passkey from /settings
 *   • Sign out
 *
 * The client talks to the catch-all `/api/auth/*` route on the server,
 * which forwards everything to Better Auth's handler. Cookies are
 * httpOnly + same-origin so the browser handles session persistence
 * automatically — we never read the token in JS.
 *
 * Plugins must mirror the server set. Right now that's the passkey
 * plugin; GitHub OAuth doesn't need a client plugin (the social-sign-in
 * call goes straight through the core client).
 */
import { createAuthClient } from 'better-auth/svelte';
import { passkeyClient } from '@better-auth/passkey/client';

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
 * The actual API calls don't use this baseURL — they route through the
 * backend-discovery resolver in lib/client/backend-discovery.ts — so the
 * placeholder is purely to keep better-auth's validator happy.
 */
function safeBaseURL(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const origin = window.location.origin;
  if (origin.startsWith('http://') || origin.startsWith('https://')) return origin;
  return 'http://localhost';
}

export const authClient = createAuthClient({
  baseURL: safeBaseURL(),
  plugins: [passkeyClient()],
});

export const { signIn, signOut, signUp, useSession, getSession, passkey } = authClient;
