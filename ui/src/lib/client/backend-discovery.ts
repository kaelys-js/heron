/** Backend URL resolver for every Capacitor / Electron target. Probes
 *  in order: opts.embeddedUrl (Electron main), localhost:5173 (vite
 *  dev), _heron._tcp.local (mDNS), opts.tailscaleHost, opts.productionUrl.
 *  First /api/health 200 within 1s wins; result cached in Preferences
 *  with 5min TTL. UI exposes the active source via the
 *  DEV/PROD/LAN/TAILSCALE/REMOTE pill. */
import { Preferences } from '@capacitor/preferences';
import { BRAND } from './brand';

export type BackendSource = 'embedded' | 'dev' | 'lan' | 'tailscale' | 'remote' | 'manual';

export type ResolvedBackend = {
  url: string;
  source: BackendSource;
  resolvedAt: number;
};

export type ResolverOptions = {
  /** Set by Electron main process via window.__HERON__.embeddedUrl. */
  embeddedUrl?: string;
  /** User-configured Tailscale host, e.g. "macbook-pro.tail-xxxx.ts.net:5173". */
  tailscaleHost?: string;
  /** Last-resort remote URL -- e.g. "https://heron.example.dev". */
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
 * /api/health is a thin endpoint that returns the running version + port --
 * cheap enough to call every resolution attempt.
 */
async function probe(url: string, timeoutMs = DEFAULT_PROBE_TIMEOUT): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, {
      signal: ctrl.signal,
      // Don't carry cookies across origins -- keeps the probe stateless.
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
 * mDNS browse for `_heron._tcp.local` on the local network. iOS 17+
 * allows this via the local-network entitlement (handled by the Bonjour
 * Capacitor plugin). On platforms that don't support it (web, older iOS)
 * returns null after a short timeout.
 *
 * We deliberately keep this loose: the function returns *some* URL we can
 * probe, not "the right URL." If multiple desktop instances are on the
 * network we pick the first one that answers.
 */
async function browseMdns(timeoutMs = 1500): Promise<string | null> {
  // Capacitor mDNS plugin doesn't ship in the core packages -- we look for
  // a runtime-injected helper (electron main sets one, an iOS bonjour
  // plugin sets another). If neither is present, we return null.
  const w = globalThis as any;
  if (typeof w.__HERON_MDNS_BROWSE__ === 'function') {
    try {
      const result = await Promise.race([
        w.__HERON_MDNS_BROWSE__(BRAND.serviceType),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
      ]);
      if (result && typeof result === 'string') {
        return result;
      }
    } catch {
      // Swallow -- mDNS is opportunistic, not authoritative.
    }
  }
  return null;
}

/** Read the cached resolution if it's still fresh AND still responds.
 *
 *  Stale-IP race fix (M7): the previous validation timeout was a flat
 *  500ms which, on a marginal cellular connection or a degraded
 *  Tailscale link, was long enough for the stale URL to respond from
 *  whatever cached DNS / route the OS was still holding -- re-blessing
 *  a defunct URL. We use a tighter 250ms + jitter so a sluggish stale
 *  IP loses the race against the resolver's "no, re-discover" path.
 *  Jitter prevents thundering-herd on the cache during repeated
 *  visibilitychange-driven re-probes. */
async function readCache(): Promise<ResolvedBackend | null> {
  try {
    const { value } = await Preferences.get({ key: CACHE_KEY });
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value) as ResolvedBackend;
    if (Date.now() - parsed.resolvedAt > CACHE_TTL_MS) {
      return null;
    }
    // 250ms ± 50ms jitter -- tight enough to refuse stale IPs that
    // respond slowly, loose enough that a healthy backend on a slow
    // wifi link still validates.
    const jitter = 250 + Math.floor(Math.random() * 100) - 50;
    if (await probe(parsed.url, jitter)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(r: ResolvedBackend): Promise<void> {
  try {
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(r) });
  } catch {
    // Best-effort -- if Preferences isn't available we just re-resolve next time.
  }
}

/** Drop the cache -- call this from the settings page when user picks
 *  "force re-discovery". */
export async function clearBackendCache(): Promise<void> {
  try {
    await Preferences.remove({ key: CACHE_KEY });
  } catch {
    // Preferences API not available (web -- no Capacitor) or the key
    // didn't exist. Either way, the cache is effectively cleared.
  }
}

/** Global resolver timeout. If every candidate stalls (e.g., slow
 *  router DNS + unreachable Tailscale + slow production), we want the
 *  resolver to fail FAST so the UI can render the BackendUnreachable
 *  overlay instead of hanging on "Connecting…" forever. 10s covers
 *  worst-case fan-out (5 candidates × ~1.5s with mDNS) plus a small
 *  safety margin. */
const GLOBAL_RESOLVE_TIMEOUT_MS = 10_000;

/**
 * Main resolver. Returns the URL plus the source label so the UI can
 * render the DEV/PROD/LAN/TAILSCALE/REMOTE pill.
 *
 * Order of attempts is deliberately fastest-likely-success-first so cold
 * boot resolves in <100ms in the common case (embedded URL).
 *
 * Bounded by GLOBAL_RESOLVE_TIMEOUT_MS -- if every candidate hangs (slow
 * DNS, unreachable Tailscale, no production), throws
 * `BackendNotFoundError('discovery timeout')` rather than spinning on
 * "Connecting…" forever.
 */
export async function resolveBackend(opts: ResolverOptions = {}): Promise<ResolvedBackend> {
  // Screenshot mode: the iOS XCUITest harness (and the local capture script)
  // inject `window.__HERON_SCREENSHOTS__ = { backend }` at document-start, so
  // the seeded screenshot-mode server is used directly instead of running the
  // dev -> mDNS -> Tailscale -> prod ladder (which has no answer in the sim/CI).
  // Short-circuit before the race so the global resolve timeout never applies.
  const shot = (globalThis as { __HERON_SCREENSHOTS__?: { backend?: string } })
    .__HERON_SCREENSHOTS__;
  if (shot?.backend) {
    return { url: shot.backend.replace(/\/+$/, ''), source: 'manual', resolvedAt: Date.now() };
  }
  return Promise.race([
    resolveBackendInner(opts),
    new Promise<ResolvedBackend>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new BackendNotFoundError(
              `Backend discovery timed out after ${GLOBAL_RESOLVE_TIMEOUT_MS}ms. ` +
                `LAN / Tailscale / production all unresponsive.`,
            ),
          ),
        GLOBAL_RESOLVE_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function resolveBackendInner(opts: ResolverOptions = {}): Promise<ResolvedBackend> {
  if (!opts.forceRefresh) {
    const cached = await readCache();
    if (cached) {
      return cached;
    }
  }

  const probeTimeout = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT;

  // 1. Embedded (Electron prod).
  if (opts.embeddedUrl && (await probe(opts.embeddedUrl, probeTimeout))) {
    const r: ResolvedBackend = {
      url: opts.embeddedUrl,
      source: 'embedded',
      resolvedAt: Date.now(),
    };
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
    const tsUrl = opts.tailscaleHost.startsWith('http')
      ? opts.tailscaleHost
      : `http://${opts.tailscaleHost}`;
    if (await probe(tsUrl, probeTimeout)) {
      const r: ResolvedBackend = { url: tsUrl, source: 'tailscale', resolvedAt: Date.now() };
      await writeCache(r);
      return r;
    }
  }

  // 5. Production / user-configured remote.
  if (opts.productionUrl && (await probe(opts.productionUrl, probeTimeout))) {
    const r: ResolvedBackend = {
      url: opts.productionUrl,
      source: 'remote',
      resolvedAt: Date.now(),
    };
    await writeCache(r);
    return r;
  }

  throw new BackendNotFoundError(
    `No ${BRAND.displayName} backend found. Tried: embedded, localhost:5173, mDNS LAN, Tailscale, production.`,
  );
}

export class BackendNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BackendNotFoundError';
  }
}

/**
 * Manual override -- set when the user picks a URL in /settings.
 * Stored in Preferences so it survives app restarts.
 */
export async function setManualBackend(url: string): Promise<ResolvedBackend> {
  const r: ResolvedBackend = { url, source: 'manual', resolvedAt: Date.now() };
  await writeCache(r);
  return r;
}

/** UI helper -- the pill label shown in the topbar. */
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
