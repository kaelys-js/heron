/**
 * sse-client -- shared EventSource wrapper with:
 *
 *   1. Cross-origin URL resolution via getApiBase() -- fixes the
 *      Capacitor iOS bug where raw `/api/stream` resolves to
 *      `heron://localhost/api/stream` (no backend behind it) instead
 *      of the discovered LAN/Tailscale URL.
 *
 *   2. Exponential backoff reconnect (1s → 2s → 4s → ... → cap=30s).
 *      Previously: `notifications.svelte.ts` had its own backoff,
 *      `sse-notifications-bridge.ts` had nothing (relied on browser's
 *      30s default). Now both share this helper so reconnect feel is
 *      identical across the app.
 *
 *   3. Network-state coordination via `BRAND_EVENTS.netStatus`
 *      (iOS NWPathMonitor → JS) and `window.online` (browser default).
 *      On a network-up signal, backoff resets to 0 and a reconnect
 *      fires immediately -- so users don't wait the full backoff after
 *      airplane-mode toggles off.
 *
 *   4. Idempotent close + restart. `client.close()` is safe to call
 *      multiple times; `client.restart()` tears down + re-resolves
 *      the backend URL (call when the user picks "force re-discovery"
 *      in Settings).
 *
 * Usage:
 *
 *   const client = createSseClient('/api/stream', {
 *     onMessage: (ev) => handleEvent(JSON.parse(ev.data)),
 *     onOpen: () => setStatus('open'),
 *     onError: () => setStatus('error'),
 *   });
 *   // ... later
 *   client.close();
 */
import { getApiBase, onBackendStatusChange } from './api-base';
import { BRAND_EVENTS } from './brand';

export type SseClientOptions = {
  /** Called on every `message` event. Wrap with a try/catch if your
   *  payload parsing can throw -- the helper doesn't intercept errors
   *  from your handler. */
  onMessage?: (event: MessageEvent) => void;
  /** Fired on successful open (initial + every reconnect). */
  onOpen?: () => void;
  /** Fired on every error event the EventSource emits. The helper
   *  schedules the reconnect itself; this hook is purely for UI status. */
  onError?: () => void;
  /** Max backoff delay in ms. Default 30_000. */
  maxBackoffMs?: number;
  /** First-attempt backoff floor in ms. Default 1_000 (so retries don't
   *  storm a flapping backend). */
  baseBackoffMs?: number;
};

export type SseClient = {
  /** Tear down the current EventSource + cancel any pending reconnect.
   *  Idempotent. */
  close: () => void;
  /** Force a fresh connection -- drops the current EventSource, re-resolves
   *  the backend URL, and reconnects. Use when the user changes backend
   *  settings or after a long offline period. */
  restart: () => void;
};

/** Lazy import of `browser` for SSR-safe usage. EventSource doesn't
 *  exist on the server; this module guards every public method on
 *  `typeof window !== 'undefined'`. */
function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof EventSource !== 'undefined';
}

export function createSseClient(path: string, opts: SseClientOptions = {}): SseClient {
  if (!inBrowser()) {
    // SSR / Node test runner -- return a no-op shape so callers don't
    // have to branch on browser checks.
    return { close: () => undefined, restart: () => undefined };
  }

  const baseBackoff = opts.baseBackoffMs ?? 1_000;
  const maxBackoff = opts.maxBackoffMs ?? 30_000;

  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closed = false;

  // Backend URL changes (user clicks "force re-discovery" in /settings,
  // or visibility-change triggers resetApiBase()) -- tear down + reconnect.
  const unsubscribeBackend = onBackendStatusChange((s) => {
    if (closed) return;
    // 'resolved' fires both on initial resolve AND after a reset →
    // reconnect to the new URL even if it's the same string.
    if (s.state === 'resolved' || s.state === 'idle') {
      // Idle is rare in practice but means "re-resolution pending" --
      // proactively close the stale ES so we don't keep hammering an
      // old URL while resolution is in flight.
      closeEventSource();
      attempt = 0;
      scheduleReconnect(0);
    }
  });

  // Network-up coordination. iOS NWPathMonitor fires
  // `BRAND_EVENTS.netStatus` with { online: true } before browsers'
  // own `online` event lands; we listen for both so the reconnect
  // happens as soon as either signal arrives.
  function handleNetStatus(e: Event): void {
    if (closed) return;
    const detail = (e as CustomEvent<{ online?: boolean }>).detail;
    if (detail && detail.online === false) {
      // Going offline → no point thrashing reconnects. Close + wait.
      closeEventSource();
      return;
    }
    // Online (or unknown payload) → reset backoff + reconnect ASAP.
    attempt = 0;
    closeEventSource();
    scheduleReconnect(0);
  }
  function handleBrowserOnline(): void {
    if (closed) return;
    attempt = 0;
    closeEventSource();
    scheduleReconnect(0);
  }

  window.addEventListener(BRAND_EVENTS.netStatus, handleNetStatus);
  window.addEventListener('online', handleBrowserOnline);

  function closeEventSource(): void {
    if (es) {
      try {
        es.close();
      } catch {
        /* idempotent */
      }
      es = null;
    }
  }

  function scheduleReconnect(delay: number): void {
    if (closed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (closed) return;
    closeEventSource();

    let base = '';
    try {
      base = await getApiBase();
    } catch {
      // Discovery failed (no backend reachable). Don't open an
      // EventSource against a phantom URL -- schedule a backoff retry.
      // The api-base listener will also force-reconnect when
      // resolution eventually succeeds.
      opts.onError?.();
      const delay = Math.min(maxBackoff, baseBackoff * 2 ** attempt);
      attempt += 1;
      scheduleReconnect(delay);
      return;
    }
    if (closed) return;

    const url = (base || '') + path;
    try {
      es = new EventSource(url, { withCredentials: false });
    } catch {
      // EventSource ctor only throws on bad URL syntax. Schedule a
      // retry and bail.
      const delay = Math.min(maxBackoff, baseBackoff * 2 ** attempt);
      attempt += 1;
      scheduleReconnect(delay);
      return;
    }
    es.onopen = () => {
      attempt = 0;
      opts.onOpen?.();
    };
    es.onerror = () => {
      opts.onError?.();
      // EventSource sets readyState=2 on terminal close, =0 on
      // transient (browser-auto-reconnect) state. Browser auto-reconnect
      // re-tries the SAME URL -- which is exactly wrong on Capacitor
      // after a backend-URL change. We disable it by closing the ES
      // and scheduling our own reconnect through `connect()`, which
      // re-resolves via getApiBase().
      closeEventSource();
      const delay = Math.min(maxBackoff, baseBackoff * 2 ** attempt);
      attempt += 1;
      scheduleReconnect(delay);
    };
    if (opts.onMessage) {
      es.onmessage = opts.onMessage;
    }
  }

  // Kick off the first connect on next tick so callers can attach to
  // status streams before the first onOpen / onError fires.
  scheduleReconnect(0);

  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      closeEventSource();
      unsubscribeBackend();
      window.removeEventListener(BRAND_EVENTS.netStatus, handleNetStatus);
      window.removeEventListener('online', handleBrowserOnline);
    },
    restart: () => {
      if (closed) return;
      closeEventSource();
      attempt = 0;
      scheduleReconnect(0);
    },
  };
}
