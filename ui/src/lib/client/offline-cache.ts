/** IndexedDB read-cache for apiCall(). Serves last-known data when the
 *  backend is unreachable. Scope: only GET on CACHEABLE_PATTERNS list
 *  endpoints (high-cardinality URLs like /api/job/[id] excluded). Cache
 *  is fallback-only -- never preferred over a live fetch; successful
 *  fetches write-through. LRU evict at MAX_ENTRIES. Cleared on logout
 *  via clearCache() so a shared device doesn't leak prior reads. */

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
  url: string; // full URL including query string -- keypath
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
