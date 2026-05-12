/**
 * backend-discovery — the spine of every Capacitor target.
 *
 * Whether you launched the Vite dev server, the production Electron build,
 * a remote-hosted server, or a phone on a different network — this resolver
 * finds the backend at boot, caches it, and exposes it as a stable URL.
 *
 * Resolution order:
 *
 *   1. `opts.embeddedUrl`          (Electron prod build serves its own
 *                                   Node server; main process passes
 *                                   the port via window.__CAREER_OPS__)
 *   2. `http://localhost:5173`     (Vite dev server on this machine —
 *                                   useful when running iOS simulator
 *                                   alongside `pnpm dev` on the Mac)
 *   3. `_career-ops._tcp.local`    (mDNS browse on the local network —
 *                                   for iOS device on the same wifi as
 *                                   the desktop app)
 *   4. `opts.tailscaleHost`        (configured Tailscale magic-DNS host,
 *                                   for phone away from home)
 *   5. `opts.productionUrl`        (last-resort user-configured remote)
 *
 * The first candidate that responds 200 to `/api/health` within 1s wins.
 * Result is cached in Preferences with a 5min TTL. UI surfaces the
 * current source via the DEV / PROD / LAN / TAILSCALE / REMOTE pill so
 * the user always knows what they're hitting.
 *
 * This module is platform-agnostic — it imports Preferences from
 * @capacitor/preferences (which has a web fallback), and only attempts
 * mDNS when the runtime supports it. On plain browsers (`pnpm dev`),
 * everything still works: localhost:5173 wins at step 2.
 */
import { Preferences } from '@capacitor/preferences';
import { BRAND } from './brand';

export type BackendSource =
  | 'embedded'
  | 'dev'
  | 'lan'
  | 'tailscale'
  | 'remote'
  | 'manual';

export type ResolvedBackend = {
  url: string;
  source: BackendSource;
  resolvedAt: number;
};

export type ResolverOptions = {
  /** Set by Electron main process via window.__CAREER_OPS__.embeddedUrl. */
  embeddedUrl?: string;
  /** User-configured Tailscale host, e.g. "macbook-pro.tail-xxxx.ts.net:5173". */
  tailscaleHost?: string;
  /** Last-resort remote URL — e.g. "https://career-ops.example.dev". */
  productionUrl?: string;
  /** Per-call timeout for health probe. */
  probeTimeoutMs?: number;
  /** Skip the cache and re-resolve. */
  forceRefresh?: boolean;
};

const CACHE_KEY = `${BRAND.name}:backend-resolved`;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_PROBE_TIMEOUT = 1000;
const DEV_FALLBACK = 'http://localhost:5173';

/**
 * Probe a candidate URL by hitting /api/health. Returns true if it answers
 * 200 within `timeoutMs`. Uses fetch with AbortController to avoid hanging.
 *
 * /api/health is a thin endpoint that returns the running version + port —
 * cheap enough to call every resolution attempt.
 */
async function probe(url: string, timeoutMs = DEFAULT_PROBE_TIMEOUT): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/api/health', {
      signal: ctrl.signal,
      // Don't carry cookies across origins — keeps the probe stateless.
      credentials: 'omit',
      method: 'GET',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * mDNS browse for `_career-ops._tcp.local` on the local network. iOS 17+
 * allows this via the local-network entitlement (handled by the Bonjour
 * Capacitor plugin). On platforms that don't support it (web, older iOS)
 * returns null after a short timeout.
 *
 * We deliberately keep this loose: the function returns *some* URL we can
 * probe, not "the right URL." If multiple desktop instances are on the
 * network we pick the first one that answers.
 */
async function browseMdns(timeoutMs = 1500): Promise<string | null> {
  // Capacitor mDNS plugin doesn't ship in the core packages — we look for
  // a runtime-injected helper (electron main sets one, an iOS bonjour
  // plugin sets another). If neither is present, we return null.
  const w = globalThis as any;
  if (typeof w.__CAREER_OPS_MDNS_BROWSE__ === 'function') {
    try {
      const result = await Promise.race([
        w.__CAREER_OPS_MDNS_BROWSE__(BRAND.serviceType),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
      ]);
      if (result && typeof result === 'string') return result;
    } catch {
      // Swallow — mDNS is opportunistic, not authoritative.
    }
  }
  return null;
}

/** Read the cached resolution if it's still fresh AND still responds. */
async function readCache(): Promise<ResolvedBackend | null> {
  try {
    const { value } = await Preferences.get({ key: CACHE_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as ResolvedBackend;
    if (Date.now() - parsed.resolvedAt > CACHE_TTL_MS) return null;
    // Cache-validate: re-probe quickly. If gone, re-resolve.
    if (await probe(parsed.url, 500)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(r: ResolvedBackend): Promise<void> {
  try {
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(r) });
  } catch {
    // Best-effort — if Preferences isn't available we just re-resolve next time.
  }
}

/** Drop the cache — call this from the settings page when user picks
 *  "force re-discovery". */
export async function clearBackendCache(): Promise<void> {
  try {
    await Preferences.remove({ key: CACHE_KEY });
  } catch {}
}

/**
 * Main resolver. Returns the URL plus the source label so the UI can
 * render the DEV/PROD/LAN/TAILSCALE/REMOTE pill.
 *
 * Order of attempts is deliberately fastest-likely-success-first so cold
 * boot resolves in <100ms in the common case (embedded URL).
 */
export async function resolveBackend(opts: ResolverOptions = {}): Promise<ResolvedBackend> {
  if (!opts.forceRefresh) {
    const cached = await readCache();
    if (cached) return cached;
  }

  const probeTimeout = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT;

  // 1. Embedded (Electron prod).
  if (opts.embeddedUrl && (await probe(opts.embeddedUrl, probeTimeout))) {
    const r: ResolvedBackend = { url: opts.embeddedUrl, source: 'embedded', resolvedAt: Date.now() };
    await writeCache(r);
    return r;
  }

  // 2. Local dev server.
  if (await probe(DEV_FALLBACK, probeTimeout)) {
    const r: ResolvedBackend = { url: DEV_FALLBACK, source: 'dev', resolvedAt: Date.now() };
    await writeCache(r);
    return r;
  }

  // 3. mDNS LAN browse.
  const lanUrl = await browseMdns();
  if (lanUrl && (await probe(lanUrl, probeTimeout))) {
    const r: ResolvedBackend = { url: lanUrl, source: 'lan', resolvedAt: Date.now() };
    await writeCache(r);
    return r;
  }

  // 4. Tailscale.
  if (opts.tailscaleHost) {
    const tsUrl = opts.tailscaleHost.startsWith('http') ? opts.tailscaleHost : `http://${opts.tailscaleHost}`;
    if (await probe(tsUrl, probeTimeout)) {
      const r: ResolvedBackend = { url: tsUrl, source: 'tailscale', resolvedAt: Date.now() };
      await writeCache(r);
      return r;
    }
  }

  // 5. Production / user-configured remote.
  if (opts.productionUrl && (await probe(opts.productionUrl, probeTimeout))) {
    const r: ResolvedBackend = { url: opts.productionUrl, source: 'remote', resolvedAt: Date.now() };
    await writeCache(r);
    return r;
  }

  throw new BackendNotFoundError(
    'No career-ops backend found. Tried: embedded, localhost:5173, mDNS LAN, Tailscale, production.',
  );
}

export class BackendNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BackendNotFoundError';
  }
}

/**
 * Manual override — set when the user picks a URL in /settings.
 * Stored in Preferences so it survives app restarts.
 */
export async function setManualBackend(url: string): Promise<ResolvedBackend> {
  const r: ResolvedBackend = { url, source: 'manual', resolvedAt: Date.now() };
  await writeCache(r);
  return r;
}

/** UI helper — the pill label shown in the topbar. */
export function pillLabel(source: BackendSource): string {
  const map: Record<BackendSource, string> = {
    embedded: 'PROD',
    dev: 'DEV',
    lan: 'LAN',
    tailscale: 'TAILSCALE',
    remote: 'REMOTE',
    manual: 'MANUAL',
  };
  return map[source];
}
