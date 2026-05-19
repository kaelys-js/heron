/**
 * offline-cache -- IndexedDB-backed read cache for the central apiCall.
 *
 * Goal: when the backend is unreachable (cellular without Tailscale,
 * airplane mode, server crashed), authenticated users see THEIR LAST
 * KNOWN data instead of a blocking "can't reach backend" overlay.
 *
 * What gets cached:
 *   Only GET responses to endpoints on the CACHEABLE_PATTERNS allowlist
 *   below. Anything else (mutations, probes, /api/health) bypasses the
 *   cache. The allowlist intentionally excludes high-cardinality URLs
 *   like /api/job/[id] -- caching every individual job would balloon
 *   storage; list endpoints already include the rows the UI needs.
 *
 * When cache is served:
 *   apiCall() falls back to the cache ONLY when the live fetch fails
 *   with a network error AND the URL is cacheable. Successful fetches
 *   always update the cache (transparent write-through). The cache is
 *   never preferred over the network -- it's purely an offline fallback.
 *
 * Eviction:
 *   No automatic eviction by age. We do trim by total-entry-count
 *   (MAX_ENTRIES) when a write would push us over, dropping the LRU
 *   entry. IndexedDB quota is browser-managed; for the small number of
 *   cacheable endpoints (~8) drift is negligible.
 *
 * Threat model:
 *   The cache holds the same data the user already saw on screen
 *   (encrypted at rest by the OS / browser). No additional security
 *   guarantees -- if an attacker has the device, they have the cache.
 *   Cleared on logout via `clearCache()` so a shared device doesn't
 *   leak the previous user's reads.
 */

const DB_NAME = 'heron-offline-cache';
const DB_VERSION = 1;
const STORE = 'api-responses';
const MAX_ENTRIES = 200;

/** URL prefixes the cache will serve. Matching is by `startsWith` after
 *  stripping query params, so `/api/jobs?status=Applied` and
 *  `/api/jobs?status=Evaluated` both match `/api/jobs`. */
const CACHEABLE_PATTERNS = [
  '/api/jobs',
  '/api/stats',
  '/api/notifications/feed',
  '/api/profiles',
  '/api/insights',
  '/api/version',
  '/api/onboarding/state',
  '/api/sources/status',
  '/api/widgets/snapshot',
] as const;

type CacheEntry = {
  url: string; // full URL including query string — keypath
  data: unknown;
  cachedAt: number;
  lastAccessedAt: number;
};

/** True if this URL is on the cache allowlist. Strips host + query so
 *  callers can pass either '/api/jobs' or
 *  'http://192.168.1.10:5173/api/jobs?status=Applied' and get a
 *  consistent answer. */
export function isCacheable(url: string): boolean {
  // Normalize to a path: strip protocol + host + query for the prefix
  // check, but keep the full URL as the cache key elsewhere.
  let pathOnly = url;
  try {
    if (/^https?:\/\//.test(url)) {
      pathOnly = new URL(url).pathname;
    }
  } catch {
    /* malformed URL -- fall through to the raw string match */
  }
  const queryIdx = pathOnly.indexOf('?');
  if (queryIdx >= 0) pathOnly = pathOnly.slice(0, queryIdx);
  return CACHEABLE_PATTERNS.some((pat) => pathOnly === pat || pathOnly.startsWith(pat + '/'));
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'url' });
        // Index for LRU eviction.
        store.createIndex('lastAccessedAt', 'lastAccessedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

/** Look up a cached response. Returns null if absent, malformed, or
 *  IndexedDB is unavailable. Bumps the lastAccessedAt for LRU. */
export async function getCached<T = unknown>(
  url: string,
): Promise<{ data: T; cachedAt: number } | null> {
  if (!isCacheable(url)) return null;
  try {
    const db = await openDb();
    return await new Promise<{ data: T; cachedAt: number } | null>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(url);
      getReq.onsuccess = () => {
        const entry = getReq.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // Touch lastAccessedAt for LRU. Best-effort -- don't fail the
        // read if the touch write fails.
        entry.lastAccessedAt = Date.now();
        try {
          store.put(entry);
        } catch {
          /* swallow -- cache hit is the important part */
        }
        resolve({ data: entry.data as T, cachedAt: entry.cachedAt });
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Write through to the cache after a successful network read. Caps
 *  total entry count at MAX_ENTRIES via LRU eviction. Fire-and-forget
 *  from callers -- apiCall doesn't await this. */
export async function setCached(url: string, data: unknown): Promise<void> {
  if (!isCacheable(url)) return;
  try {
    const db = await openDb();
    const now = Date.now();
    const entry: CacheEntry = { url, data, cachedAt: now, lastAccessedAt: now };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        // Over budget: evict the LRU entry before writing.
        if (countReq.result >= MAX_ENTRIES) {
          const idx = store.index('lastAccessedAt');
          const cursorReq = idx.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
            }
            // Continue to the put either way -- count was at limit, this
            // write keeps us at-or-below.
            store.put(entry);
          };
        } else {
          store.put(entry);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('cache write failed'));
    });
  } catch {
    /* best-effort */
  }
}

/** Wipe the cache. Called on logout so the next user can't see the
 *  previous user's data offline. Also exposed for the
 *  /settings/api-keys "Force re-discovery" power-user flow. */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('cache clear failed'));
    });
  } catch {
    /* best-effort */
  }
}

/** TEST-ONLY: drop the cached db handle so each test opens a fresh one. */
export function __resetDbHandle(): void {
  dbPromise = null;
}
