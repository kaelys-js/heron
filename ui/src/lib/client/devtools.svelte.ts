/**
 * Developer-tools opt-in.
 *
 * The /dev view gallery (offline / native-error / loading previews) is only
 * wired in when `dev` is true -- i.e. under the live vite server. To reach it
 * in a built or native app for on-device testing, the OWNER opts in via a
 * hidden gesture (tapping the version in Settings 7x). The flag is persisted
 * two ways:
 *   - localStorage  -> the client-side button gate reads it (reactive here)
 *   - a cookie      -> the SSR route gates (hooks.server.ts + +layout.server.ts)
 *                      read it, since localStorage is invisible to the server.
 *
 * Off by default for everyone; only the gesture flips it. We feature-detect
 * localStorage/document rather than SvelteKit's `browser` flag so the writes
 * are exercised in jsdom tests yet stay no-ops during SSR.
 */
import { DEVTOOLS_STORAGE_KEY, DEVTOOLS_COOKIE } from '$lib/devtools-keys';

function read(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DEVTOOLS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = $state(read());

export function devtoolsEnabled(): boolean {
  return enabled;
}

export function setDevtools(on: boolean): void {
  enabled = on;
  if (typeof localStorage !== 'undefined') {
    try {
      if (on) localStorage.setItem(DEVTOOLS_STORAGE_KEY, '1');
      else localStorage.removeItem(DEVTOOLS_STORAGE_KEY);
    } catch {
      // private-mode / storage-disabled: the cookie below still carries the flag
    }
  }
  if (typeof document !== 'undefined') {
    // Mirror to a cookie so the server gates honor it. 1-year max-age; clearing
    // sets max-age=0. samesite=lax is sufficient (same-site navigation only).
    const maxAge = on ? 31_536_000 : 0;
    document.cookie = `${DEVTOOLS_COOKIE}=${on ? '1' : ''}; path=/; max-age=${maxAge}; samesite=lax`;
  }
}
