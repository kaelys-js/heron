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

export const authClient = createAuthClient({
  // baseURL is inferred from window.location.origin in the browser, so
  // we don't need to hard-code localhost vs Capacitor vs Electron.
  plugins: [passkeyClient()],
});

export const { signIn, signOut, signUp, useSession, getSession, passkey } = authClient;
