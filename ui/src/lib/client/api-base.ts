/**
 * api-base — single source of truth for "where do `/api/*` calls go".
 *
 * Why this exists:
 *
 *   Same-origin browsers (`pnpm dev` on Mac, Electron embedded server)
 *   talk to a backend that lives at `window.location.origin` — fetch with
 *   a relative path "just works".
 *
 *   Capacitor iOS / Android live at custom URL schemes (`careerops://localhost`
 *   on iOS, `https://localhost` on Android-with-WebView) that don't actually
 *   serve HTTP. Any relative-URL fetch in those WebViews hits a phantom
 *   origin and 404s. The fix is to discover the real backend at boot
 *   (lib/client/backend-discovery.ts: localhost dev → mDNS → Tailscale →
 *   production) and prepend it to every fetch.
 *
 * Usage:
 *
 *   import { getApiBase } from '$lib/client/api-base';
 *   const base = await getApiBase();   // '' on web, 'http://192.168.1.5:5173' on iOS
 *   await fetch(base + '/api/health');
 *
 * `apiBaseSync()` is the synchronous read used by code that can't await
 * (early hydration, top-level module imports). It returns '' until the
 * first `getApiBase()` resolves, then the cached value.
 */
import { resolveBackend } from './backend-discovery';

let cachedBase: string | null = null;
let resolving: Promise<string> | null = null;

/**
 * Resolve once + memoize. The cache lives on this module for the page's
 * lifetime; reset by calling `resetApiBase()` (e.g. on visibilitychange
 * after a long backgrounded period, when the LAN IP may have changed).
 */
export async function getApiBase(): Promise<string> {
  if (cachedBase !== null) return cachedBase;
  if (resolving) return resolving;

  // Same-origin path: any browser whose `window.location.origin` is an
  // actual http(s) URL already speaks the same origin as the backend.
  // Fall back to '' so callers keep using relative paths.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin.startsWith('http://') || origin.startsWith('https://')) {
    cachedBase = '';
    return '';
  }

  // Cross-origin path (Capacitor). Kick off backend-discovery; the first
  // candidate that answers `/api/health` within 1s wins.
  resolving = resolveBackend({}).then(
    (r) => {
      cachedBase = r.url.replace(/\/$/, '');
      resolving = null;
      return cachedBase;
    },
    (err) => {
      // Don't memoize failure — next call retries. Surface so the caller
      // can render a "Can't find backend" banner.
      resolving = null;
      throw err;
    },
  );
  return resolving;
}

/**
 * Synchronous read of the cached base. Returns '' until resolution succeeds.
 * Safe to call from hydration paths and top-level modules where awaiting
 * isn't possible.
 */
export function apiBaseSync(): string {
  return cachedBase ?? '';
}

/**
 * Drop the memoized base so the next `getApiBase()` re-runs discovery.
 * Call this on `visibilitychange` after a long backgrounded period, or
 * from `/settings` when the user picks "force re-discovery".
 */
export function resetApiBase(): void {
  cachedBase = null;
  resolving = null;
}
