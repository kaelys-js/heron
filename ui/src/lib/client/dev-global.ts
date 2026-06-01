/** `window.heron` -- a small, frozen developer global.
 *
 *  Paste-safe by construction. It carries the build identity (version, git
 *  SHA, env, platform), the resolved backend + request id (so a developer or
 *  support contact can correlate a session to its server log), the public
 *  docs/source/community links, and a few SAFE action facades: `help()`,
 *  `diagnostics.{show,hide,dump}` (a thin wrapper over app.html's on-device
 *  overlay), and `clearCacheAndReset()` (the shared client teardown).
 *
 *  SECURITY (hard boundary): this object NEVER carries the bearer token, the
 *  `authed` flag, the session, the user, any API key, or any PII. It pairs with
 *  the production self-XSS console warning -- the object is `Object.freeze`d
 *  (object + nested `links`/`diagnostics`) so pasted code can't repoint the
 *  actions, and there is no credential surface to read off it in the first
 *  place. Only build identity + public links + safe actions go on it.
 *
 *  `buildHeronGlobal` is the PURE builder (unit-tested, incl. the security
 *  assertions); the side effect (reading live defines / brand / backend /
 *  request-id / platform + the diagnostics facade, then assigning the global
 *  once) lives in `installDevGlobal`, called from +layout's onMount right after
 *  installConsoleBanner.
 */
import { Capacitor } from '@capacitor/core';
import { BRAND, DISCORD_URL } from './brand';
import { apiBaseSync } from './api-base';
import { getRequestId } from './request-id';
import { clearClientCacheAndReset } from './reset';

// Brand palette (mirrors console-banner.ts -- the console can't read CSS custom
// properties, so the GOLD/REED/SLATE values are inlined the same way).
const GOLD = '#c89b4a';
const REED = '#7a8c6d';
const SLATE = '#8b97a6';

/** The frozen, paste-safe public surface assigned to `window.heron`. */
export interface HeronGlobal {
  readonly version: string;
  /** Short git SHA. '' on a shallow / non-git build. */
  readonly build: string;
  readonly env: 'development' | 'production';
  /** 'web' | 'ios' | 'electron' -- Capacitor.getPlatform(). */
  readonly platform: string;
  /** Resolved backend origin ('' on a same-origin web build). */
  readonly backendUrl: string;
  /** Per-request correlation id ('' off-server / before hydration). */
  readonly requestId: string;
  readonly links: { readonly docs: string; readonly source: string; readonly community: string };
  /** Print a styled console summary of the fields + action methods. */
  help(): void;
  /** Facade over app.html's on-device diagnostics overlay (null-safe). */
  diagnostics: { show(): void; hide(): void; dump(): string };
  /** Sign out + wipe client state + reload to /login (client-only). */
  clearCacheAndReset(): Promise<void>;
}

/** Pure inputs the builder needs -- everything the install reads from live
 *  sources is passed in here so the builder stays testable and side-effect-free.
 *  NOTE: there is NO credential field. The builder cannot leak a token because
 *  it is never handed one. */
export interface HeronGlobalSources {
  version: string;
  build: string;
  env: 'development' | 'production';
  platform: string;
  backendUrl: string;
  requestId: string;
  docs: string;
  source: string;
  community: string;
  diagnostics: { show(): void; hide(): void; dump(): string };
  clearCacheAndReset(): Promise<void>;
}

/** Build the styled help() console output. Separate so the side-effecting
 *  method body stays tiny and the styling is co-located with the banner idiom. */
function logHelp(h: HeronGlobal): void {
  // eslint-disable-next-line no-console
  console.log(
    `%c${BRAND.displayName} developer console%c\n` +
      `version    v${h.version}${h.build ? ` · build ${h.build}` : ''} · ${h.env}\n` +
      `platform   ${h.platform}\n` +
      `backend    ${h.backendUrl || '(web origin)'}\n` +
      `request-id ${h.requestId || '(none)'}\n` +
      `links      docs ${h.links.docs}  ·  source ${h.links.source}  ·  community ${h.links.community}\n` +
      '\n' +
      'methods\n' +
      '  heron.help()                  this message\n' +
      '  heron.diagnostics.show()      open the on-device diagnostics overlay\n' +
      '  heron.diagnostics.hide()      close it\n' +
      '  heron.diagnostics.dump()      return the diagnostics buffer as a string\n' +
      '  heron.clearCacheAndReset()    sign out + wipe client state + reload to /login',
    `color:${GOLD};font-size:14px;font-weight:700;font-family:Georgia,'Times New Roman',serif;`,
    `color:${SLATE};font-size:12px;font-family:ui-monospace,monospace;line-height:1.6;`,
  );
  // A reed-toned footnote so the security posture is discoverable from the
  // console itself (reinforces the prod self-XSS warning).
  // eslint-disable-next-line no-console
  console.log(
    '%cThis object carries build info + public links + safe actions only -- never your token, session, or keys.',
    `color:${REED};font-size:11px;font-style:italic;`,
  );
}

/** PURE builder: assemble the frozen, paste-safe global from already-resolved
 *  inputs. Object + nested `links`/`diagnostics` are frozen so pasted code can't
 *  repoint the actions. */
export function buildHeronGlobal(s: HeronGlobalSources): HeronGlobal {
  const links = Object.freeze({
    docs: s.docs,
    source: s.source,
    community: s.community,
  });
  const diagnostics = Object.freeze({
    show: () => s.diagnostics.show(),
    hide: () => s.diagnostics.hide(),
    dump: () => s.diagnostics.dump(),
  });

  const h = {
    version: s.version,
    build: s.build,
    env: s.env,
    platform: s.platform,
    backendUrl: s.backendUrl,
    requestId: s.requestId,
    links,
    help(): void {
      logHelp(h);
    },
    diagnostics,
    clearCacheAndReset(): Promise<void> {
      return s.clearCacheAndReset();
    },
  } as HeronGlobal;

  return Object.freeze(h);
}

let installed = false;

/** Read live sources + assign `window.heron` exactly once (browser only).
 *  Idempotent across HMR / re-mounts via a module flag, mirroring
 *  installConsoleBanner. */
export function installDevGlobal(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;

  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  const build = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
  // import.meta.env.DEV is statically replaced by Vite -- prod tree-shakes the
  // env to 'production'.
  const env: 'development' | 'production' = import.meta.env.DEV ? 'development' : 'production';

  let platform = 'web';
  try {
    platform = Capacitor.getPlatform();
  } catch {
    /* @capacitor/core absent (shouldn't happen in-bundle) -- default to web */
  }

  // app.html installs window.__heronDiag (the on-device overlay). The facade is
  // null-safe: off Capacitor / before the early-head script runs, the methods
  // are no-ops and dump() returns a sentinel rather than throwing.
  type Diag = ((msg: string) => void) & {
    show?: () => void;
    hide?: () => void;
    dump?: () => string;
  };
  const diagBuffer = (): Diag | undefined =>
    (globalThis as unknown as { __heronDiag?: Diag }).__heronDiag;

  const heron = buildHeronGlobal({
    version,
    build,
    env,
    platform,
    backendUrl: apiBaseSync(),
    requestId: getRequestId(),
    docs: BRAND.repo.homepage,
    source: BRAND.repo.url,
    community: DISCORD_URL,
    diagnostics: {
      show: () => diagBuffer()?.show?.(),
      hide: () => diagBuffer()?.hide?.(),
      dump: () => diagBuffer()?.dump?.() ?? '(diagnostics overlay not installed)',
    },
    clearCacheAndReset: () => clearClientCacheAndReset(),
  });

  // Assign onto window. The property itself is writable on window, but the
  // VALUE is frozen, so pasted code can read identity / call safe actions but
  // can't repoint `heron.clearCacheAndReset` to an attacker function.
  (window as unknown as { heron: HeronGlobal }).heron = heron;
}
