/** Where do /api/* calls go? Same-origin on web (returns ''), but
 *  Capacitor WebViews live at heron://localhost which serves no HTTP --
 *  fetch needs the real backend URL. `getApiBase()` resolves via
 *  backend-discovery (localhost / mDNS / Tailscale / production).
 *  `apiBaseSync()` returns the cached value (or '' before first
 *  resolve) for code that can't await. */
import { resolveBackend } from './backend-discovery';
import type { BackendSource } from './backend-discovery';

let cachedBase: string | null = null;
let resolving: Promise<string> | null = null;

/** Listener-based reactive status -- components subscribe to render a
 *  "Looking for backend…" / "Backend: DEV/LAN/REMOTE" / "Can't find backend"
 *  badge. Mirrors the lightweight listener pattern in online-status.svelte. */
export type BackendStatus =
  | { state: 'idle' }
  | { state: 'resolving' }
  | { state: 'resolved'; url: string; source: BackendSource }
  | { state: 'error'; message: string };

let status: BackendStatus = { state: 'idle' };
const listeners = new Set<(s: BackendStatus) => void>();
function setStatus(next: BackendStatus): void {
  status = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* listener threw -- ignore so one bad sub doesn't break the rest */
    }
  }
}
export function getBackendStatus(): BackendStatus {
  return status;
}
export function onBackendStatusChange(fn: (s: BackendStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Resolve once + memoize. The cache lives on this module for the page's
 * lifetime; reset by calling `resetApiBase()` (e.g. on visibilitychange
 * after a long backgrounded period, when the LAN IP may have changed).
 */
export async function getApiBase(): Promise<string> {
  if (cachedBase !== null) {
    return cachedBase;
  }
  if (resolving) {
    return resolving;
  }

  // Same-origin path: any browser whose `window.location.origin` is an
  // actual http(s) URL already speaks the same origin as the backend.
  // Fall back to '' so callers keep using relative paths.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin.startsWith('http://') || origin.startsWith('https://')) {
    cachedBase = '';
    setStatus({ state: 'resolved', url: origin, source: 'embedded' });
    return '';
  }

  // Cross-origin path (Capacitor). Kick off backend-discovery; the
  // first candidate that answers `/api/health` within 1s wins. Read
  // user-configured Tailscale + production URLs from App Group / local-
  // Storage BEFORE the resolver so steps 4 + 5 of the waterfall
  // (Tailscale, production) actually have somewhere to point.
  //
  // Previously this called resolveBackend({}) with no opts, so even a
  // user with Tailscale running on their phone + a reachable Mac at
  // `imac.tail-xxxx.ts.net:5173` would see "no backend found" because
  // the resolver skipped Tailscale entirely. The /settings/backend
  // route lets users enter these values; native-bridge persists them;
  // we read them here so the resolver tries them.
  setStatus({ state: 'resolving' });
  resolving = (async () => {
    let tailscaleHost: string | undefined;
    let productionUrl: string | undefined;
    try {
      const { getSharedTailscaleUrl, getSharedProductionUrl } = await import('./native-bridge');
      const [ts, prod] = await Promise.all([getSharedTailscaleUrl(), getSharedProductionUrl()]);
      if (ts) {
        tailscaleHost = ts;
      }
      if (prod) {
        productionUrl = prod;
      }
    } catch {
      // native-bridge unavailable on web -- fall through with undefined
      // values, resolver will skip the corresponding candidates.
    }
    try {
      const r = await resolveBackend({ tailscaleHost, productionUrl });
      cachedBase = r.url.replace(/\/$/, '');
      setStatus({ state: 'resolved', url: cachedBase, source: r.source });
      return cachedBase;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ state: 'error', message: msg });
      throw err;
    } finally {
      resolving = null;
    }
  })();
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
  setStatus({ state: 'idle' });
}
