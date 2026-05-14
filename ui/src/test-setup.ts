/**
 * test-setup.ts — runs ONCE per test file BEFORE any test in it.
 *
 * Provides:
 *   • testing-library/jest-dom matchers (`toBeInTheDocument`, etc.)
 *   • MSW server lifecycle (`beforeAll`/`afterEach`/`afterAll`)
 *   • matchMedia polyfill for jsdom — defaults to desktop. Per-test
 *     viewport flip via `setMobileViewport(true|false)` from
 *     `test-helpers/render.ts`.
 *   • `$env/*` stubs so server modules don't blow up on import.
 *   • Capacitor Preferences in-memory shim.
 *   • Deterministic `crypto.randomUUID` for snapshot stability.
 *   • `fake-indexeddb/auto` import so any IDB-using store works under jsdom.
 *
 * Runs in EVERY project (unit, server, component, routes, integration).
 * Browser-mode project still loads this file but the matchMedia polyfill
 * is a no-op there (real browser has the real `window.matchMedia`).
 */
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ── IndexedDB shim (jsdom doesn't ship one) ────────────────────────
// Wrapped in try/catch — browser mode already has IDB; importing
// fake-indexeddb there would clobber the real one.
try {
  if (typeof window !== 'undefined' && !('indexedDB' in window)) {
    // fake-indexeddb ships ESM-only without bundled types for its
    // `/auto` side-effect entry — `@ts-ignore` is the standard workaround
    // since the import has no return value we care about.
    // @ts-ignore — no type decl for /auto side-effect entry
    await import('fake-indexeddb/auto');
  }
} catch {
  // browser mode + already-shimmed envs both no-op here
}

// ── localStorage polyfill (jsdom v29 quirk) ────────────────────────
// jsdom 29's built-in localStorage prints a "no valid path" warning
// AND (under certain Vitest configurations) returns an object missing
// `getItem`/`setItem`. Polyfill unconditionally — cheap, deterministic,
// makes tests independent of the jsdom config. Real browsers (component
// project) skip this branch.
if (typeof window !== 'undefined') {
  const __localBacking = new Map<string, string>();
  const __sessionBacking = new Map<string, string>();
  const makeStorage = (backing: Map<string, string>): Storage => ({
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (k: string) => backing.get(k) ?? null,
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    removeItem: (k: string) => {
      backing.delete(k);
    },
    setItem: (k: string, v: string) => {
      backing.set(k, String(v));
    },
  });
  const real = typeof window.localStorage?.getItem === 'function';
  if (!real) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: makeStorage(__localBacking),
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: makeStorage(__sessionBacking),
    });
  }
}

// ── matchMedia polyfill (jsdom only) ───────────────────────────────
// Real browsers (component project) already have this; the guard
// prevents us from re-defining the property on `window`.
type MediaListener = (e: MediaQueryListEvent) => void;
const __mqlListeners = new Map<string, Set<MediaListener>>();
let __isMobile = false;

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => {
      const listeners = __mqlListeners.get(query) ?? new Set<MediaListener>();
      __mqlListeners.set(query, listeners);

      const mql: MediaQueryList = {
        matches: query.includes('max-width: 768px') ? __isMobile : false,
        media: query,
        onchange: null,
        addListener: () => undefined, // legacy
        removeListener: () => undefined, // legacy
        addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
          if (type === 'change') listeners.add(cb as unknown as MediaListener);
        },
        removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
          if (type === 'change') listeners.delete(cb as unknown as MediaListener);
        },
        dispatchEvent: () => false,
      };
      return mql;
    },
  });
}

/**
 * Test-only helper — flips the `(max-width: 768px)` polyfill and
 * fires change events to every registered listener. Used by
 * `renderMobile()` / `renderDesktop()` in test-helpers.
 */
export function setMobileViewport(isMobile: boolean): void {
  __isMobile = isMobile;
  const listeners = __mqlListeners.get('(max-width: 768px)');
  if (!listeners) return;
  const event = { matches: isMobile, media: '(max-width: 768px)' } as MediaQueryListEvent;
  listeners.forEach((cb) => cb(event));
}

// ── $env stubs ─────────────────────────────────────────────────────
// Server modules import from `$env/static/private` / `$env/dynamic/private`.
// During tests we want deterministic values; production reads from real env.
vi.mock('$env/static/private', () => ({
  BETTER_AUTH_SECRET: 'test-secret-do-not-use-in-prod',
  BETTER_AUTH_RATE_LIMIT: 'off',
  DATABASE_URL: 'file::memory:?cache=shared',
  PUBLIC_BASE_URL: 'http://localhost:5173',
}));
vi.mock('$env/dynamic/private', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret-do-not-use-in-prod',
    BETTER_AUTH_RATE_LIMIT: 'off',
    DATABASE_URL: 'file::memory:?cache=shared',
    PUBLIC_BASE_URL: 'http://localhost:5173',
  },
}));
vi.mock('$env/static/public', () => ({
  PUBLIC_CAPACITOR_BUILD: '',
}));

// ── Capacitor Preferences shim ─────────────────────────────────────
// Module-level map persists across test renders BUT is reset by
// `resetCapacitorPreferences()` in test-helpers/state-helpers.
const __prefs = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: __prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      __prefs.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      __prefs.delete(key);
    },
    clear: async () => {
      __prefs.clear();
    },
    keys: async () => ({ keys: Array.from(__prefs.keys()) }),
    configure: async () => undefined,
    migrate: async () => ({ migrated: [], existing: [] }),
    removeOld: async () => undefined,
  },
}));

export function resetCapacitorPreferences(): void {
  __prefs.clear();
}

// ── Deterministic randomUUID ───────────────────────────────────────
// Many components feed this into keyed `{#each}` blocks. Determinism
// makes snapshot diffs sane and avoids "flaky-on-id" failures.
let __uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...(globalThis.crypto ?? {}),
  randomUUID: () =>
    `test-uuid-${++__uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`,
});

export function resetUuidCounter(): void {
  __uuidCounter = 0;
}

// ── MSW lifecycle (jsdom + node projects; browser uses
//    Service Worker variant that loads at render time) ──────────────
// Lazy import so the browser project doesn't blow up requiring node-only
// MSW APIs at top-level.
let server: { listen: () => void; close: () => void; resetHandlers: () => void } | null = null;

beforeAll(async () => {
  if (typeof window !== 'undefined' && (window as any).__VITEST_BROWSER__) {
    return; // browser mode handles MSW via Service Worker per-test
  }
  try {
    const { setupServer } = await import('msw/node');
    const { handlers } = await import('./test-helpers/msw-handlers');
    server = setupServer(...handlers);
    server.listen();
  } catch {
    // test-helpers/msw-handlers doesn't exist yet during Phase 1 bootstrap;
    // tests that need MSW will add their own server in beforeEach.
  }
});

afterEach(() => {
  server?.resetHandlers();
});

afterAll(() => {
  server?.close();
});
