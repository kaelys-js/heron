/**
 * test-setup.ts — runs ONCE per test file BEFORE any test in it.
 *
 * Provides:
 *   • DB isolation: routes auth.db + app.db to a tmpdir so no test
 *     ever writes to the developer's real data/auth.db. This prevents
 *     the "ghost first-user" bug where prior test signups left rows
 *     in users.users and a fresh-clone user could no longer be
 *     promoted to owner.
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

// ── DB isolation — MUST run before any server module is imported ────
// db/index.ts checks process.env.VITEST + process.env.HERON_DATA_DIR
// at module-load time. Setting HERON_DATA_DIR here is belt-and-
// braces: db/index.ts already auto-routes to a tmpdir when VITEST=true,
// but if some other ENV strips that var we still want isolation. The
// directory is per-process so parallel test workers don't collide.
// Browser-mode workers don't expose `process` — guard with typeof.
if (typeof process !== 'undefined' && process.env && !process.env.HERON_DATA_DIR) {
  // Lazy-import node:os/fs/path. They only resolve in the node-env
  // projects (ui-server, ui-integration). The browser-mode worker
  // skips this branch entirely via the typeof-process guard above.
  const os = require('node:os') as typeof import('node:os');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const tmp = path.join(os.tmpdir(), `heron-test-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  process.env.HERON_DATA_DIR = tmp;

  // ── Live-data write-guard ────────────────────────────────────────
  // Any test that tries to write to <repo-root>/data/ (the developer's
  // real per-user content) throws loudly. Forces tests to use the
  // tmpdir above or explicit mocks. Catches contamination at the
  // earliest possible moment — the failing test, not a downstream
  // "why is my data wrong" mystery.
  const REPO_ROOT_DATA = path.resolve(__dirname, '..', '..', 'data') + path.sep;
  const guardWrite = (label: string, target: string) => {
    if (typeof target === 'string' && target.startsWith(REPO_ROOT_DATA)) {
      throw new Error(
        `[test-isolation] ${label}() blocked: tests cannot write to live data/. ` +
          `Path: ${target}. Use /tmp/ or mocks. Set HERON_DATA_DIR before fs calls if your test needs an isolated data root.`,
      );
    }
  };
  // Use a typed alias so the inline cast doesn't trip TS's namespace
  // resolution on `fs.PathOrFileDescriptor` (the require() return is
  // the runtime module, not a type alias).
  const fsLib = fs as typeof import('node:fs');
  const origWrite = fsLib.writeFileSync;
  const origMkdir = fsLib.mkdirSync;
  const origAppend = fsLib.appendFileSync;
  fsLib.writeFileSync = ((p: unknown, ...rest: unknown[]) => {
    if (typeof p === 'string') guardWrite('writeFileSync', p);
    return (origWrite as unknown as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof fsLib.writeFileSync;
  fsLib.mkdirSync = ((p: unknown, ...rest: unknown[]) => {
    if (typeof p === 'string') guardWrite('mkdirSync', p);
    return (origMkdir as unknown as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof fsLib.mkdirSync;
  fsLib.appendFileSync = ((p: unknown, ...rest: unknown[]) => {
    if (typeof p === 'string') guardWrite('appendFileSync', p);
    return (origAppend as unknown as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof fsLib.appendFileSync;
}

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
// AND (under certain Vitest configurations) returns an object whose
// `getItem`/`setItem` exist as properties but are non-callable shims.
// `typeof obj.getItem === 'function'` returns true in some paths, false
// in others — depends on whether SvelteKit's $app/forms patching ran
// first. We install our own Map-backed Storage UNCONDITIONALLY in
// jsdom (matches the comment that always said "polyfill
// unconditionally"). Real browsers (component project) skip this
// branch via the typeof-window guard.
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

// ── Silence the `yaml` package's "unresolved tag !@#$" warnings ─────
// Several tests intentionally feed deliberately-corrupt yaml/json
// fixtures (e.g. '!@#$%^&*( not yaml' in portals.test.ts) to exercise
// parse-error recovery paths. The `yaml` package emits a YAMLWarning
// via `process.emitWarning(...)` when it sees an unresolvable tag —
// the warning is correctly emitted but in a test context it's noise
// that obscures real failures.
//
// We swallow ONLY warnings tagged `YAMLWarning` so the broader
// process-warning pipeline (deprecation notices, unhandled-rejection
// hints, etc.) still surfaces normally.
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  const origEmit = process.emit.bind(process);
  // Node's process.emit is overloaded; cast through unknown to satisfy TS.
  (process as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit = (
    event: string,
    ...args: unknown[]
  ): boolean => {
    if (event === 'warning') {
      const w = args[0] as { name?: string } | undefined;
      if (w?.name === 'YAMLWarning') return false; // swallow
    }
    return (origEmit as unknown as (event: string, ...args: unknown[]) => boolean)(event, ...args);
  };
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
    // If `test-helpers/msw-handlers` isn't compiled yet (cold cache),
    // tests that need MSW spin up their own server in beforeEach.
  }
});

afterEach(() => {
  server?.resetHandlers();
});

afterAll(() => {
  server?.close();
});
