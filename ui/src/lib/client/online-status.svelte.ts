/**
 * online-status — unified offline detection across Web / Electron / iOS.
 *
 * Three signals are reconciled into one `online` boolean:
 *
 *   1. `navigator.onLine` — fast, dirty (it lies — "online" can mean
 *      "connected to router but no internet"). Useful as a low-priority
 *      hint.
 *   2. **Backend health probe** — periodic `/api/health` GET against the
 *      resolved backend. Authoritative — if this fails we are offline
 *      for app purposes even if navigator.onLine is true.
 *   3. **Native hint** (iOS Capacitor + Electron) — NWPathMonitor on
 *      iOS and `net.isOnline()` on Electron, forwarded into this store
 *      via window-injected hooks.
 *
 * Subscribers (api.ts, OfflineIndicator.svelte, BackendBootGuard) read
 * `onlineState.online` (boolean) and listen for `online-changed` events.
 *
 * The user picked "(a) always fail with 'offline' UI when offline" —
 * we DON'T cache responses or serve stale reads. fetch() short-circuits
 * with a synthesized "offline" error so the unified error-reporter
 * stays out of it (offline is expected; reporting it spams Issues).
 */
import { BRAND, BRAND_EVENTS, BRAND_STORAGE_PREFIX } from './brand';

const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_000;
const STORAGE_KEY = `${BRAND_STORAGE_PREFIX}:online-last`;

class OnlineStore {
  /** Reactive store-style — Svelte 5 will pick up reads automatically
   *  if used inside a $derived or $effect; for plain JS callers we
   *  expose an addListener() that re-fires on every state change. */
  online = $state(true);
  /** "Why" — populated when offline. 'navigator' / 'probe' / 'native'. */
  reason = $state<string | null>(null);
  /** Last successful probe timestamp (ms). */
  lastOk = $state(Date.now());

  private timer: ReturnType<typeof setInterval> | null = null;
  private backendUrl: string | null = null;
  private listeners = new Set<(online: boolean) => void>();

  /** Wire up everything at app boot. Idempotent. */
  init(backendUrl: string | null): void {
    this.backendUrl = backendUrl;
    if (typeof window === 'undefined') return;
    // Restore last-known state for instant UI on cold boot
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.online = raw === '1';
    } catch {
      // localStorage denied (Safari private mode, iframe sandbox).
      // Cold boot will start with default `online: true` and the first
      // probe will correct it within ~PROBE_INTERVAL_MS.
    }

    // navigator.onLine — fast but flaky
    window.addEventListener('online', () => this.update(true, 'navigator'));
    window.addEventListener('offline', () => this.update(false, 'navigator'));
    this.online = navigator.onLine;

    // Periodic backend health probe — authoritative
    this.startProbing();

    // Listen for native hints (iOS / Electron forward via DOM events)
    window.addEventListener(`${BRAND.name}:net-status`, ((e: Event) => {
      const ev = e as CustomEvent<{ online: boolean }>;
      this.update(ev.detail.online, 'native');
    }) as EventListener);

    // iOS Capacitor plugin emits via Capacitor's listener bus, not DOM.
    // Bridge it lazily — dynamic import keeps web/desktop bundles small.
    void import('./native-bridge')
      .then((m) => {
        m.onNetStatusChange?.((online) => this.update(online, 'native'));
      })
      .catch(() => {});

    // Electron main process emits `<brand>:net-status` via IPC. The
    // preload bridge exposes a generic `on(channel)` for renderer use.
    const w = window as any;
    if (w?.electronAPI?.on) {
      try {
        w.electronAPI.on(`${BRAND.name}:net-status`, (payload: { online: boolean }) => {
          this.update(payload.online, 'native');
        });
      } catch {
        // Electron preload bridge missing the `on` method (older
        // build). Fall back to navigator + probe only — no crash.
      }
    }
  }

  /** Update the resolved backend URL — called by BackendBootGuard. */
  setBackend(url: string | null): void {
    this.backendUrl = url;
    if (url) void this.probe();
  }

  /** Subscribe to online↔offline transitions. */
  addListener(fn: (online: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Force a re-probe. */
  async refresh(): Promise<void> {
    await this.probe();
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.listeners.clear();
  }

  private startProbing(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.probe(), PROBE_INTERVAL_MS);
    void this.probe();
  }

  private async probe(): Promise<void> {
    if (!this.backendUrl) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // OS says offline — trust it, don't waste a request
      this.update(false, 'navigator');
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(this.backendUrl.replace(/\/$/, '') + '/api/health', {
        signal: ctrl.signal,
        credentials: 'omit',
        method: 'GET',
      });
      if (res.ok) this.update(true, null);
      else this.update(false, 'probe');
    } catch {
      this.update(false, 'probe');
    } finally {
      clearTimeout(t);
    }
  }

  private update(online: boolean, reason: string | null): void {
    if (online === this.online) {
      if (online) this.lastOk = Date.now();
      return;
    }
    this.online = online;
    this.reason = online ? null : reason;
    if (online) this.lastOk = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, online ? '1' : '0');
    } catch {
      // localStorage denied — runtime state is still authoritative,
      // we just don't restore on next cold boot.
    }
    for (const fn of this.listeners) {
      try {
        fn(online);
      } catch (e) {
        // Listener crashed — don't let one broken subscriber take down
        // the whole notification fan-out. Log to console (we're in the
        // client lib so no logEvent).
        // eslint-disable-next-line no-console
        console.error('[online-status] listener threw:', e);
      }
    }
    // Fire a DOM event so any code listening (e.g. queued fetch in api.ts)
    // can react without importing this module directly.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(`${BRAND.name}:online-changed`, { detail: { online, reason } }),
      );
    }
  }
}

export const onlineStore = new OnlineStore();

/** Thrown by api.ts when a request is short-circuited by the offline guard. */
export class OfflineError extends Error {
  readonly isOffline = true;
  constructor() {
    super('Offline');
    this.name = 'OfflineError';
  }
}

/** Helper for non-Svelte callers — just read the current state. */
export function isOnline(): boolean {
  return onlineStore.online;
}
