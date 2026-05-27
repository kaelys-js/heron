/** Pure helpers for the Electron WebView's dev-vs-prod load strategy.
 *
 *  Extracted from setup.ts (which imports electron) so this logic is unit-
 *  testable without mocking the whole Electron runtime -- same pattern as
 *  tray-http / deep-links / net-polling.
 *
 *  Context: `pnpm dev:desktop` used to show an empty window because the main
 *  process ALWAYS electron-served the bundled static `app/` dir -- even in dev,
 *  where that dir is stale/absent and the live app is served by vite on :5173.
 *  In dev we instead load the vite dev server (live content + HMR).
 */

/** Vite dev-server URL to load in development, or null in production (where the
 *  packaged app uses electron-serve). Overridable via ELECTRON_DEV_SERVER_URL /
 *  CAPACITOR_SERVER_URL; defaults to vite's :5173 (what `pnpm dev` binds). */
export function resolveDevServerUrl(
  isDev: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isDev) return null;
  const override = (env.ELECTRON_DEV_SERVER_URL || env.CAPACITOR_SERVER_URL || '').trim();
  return override || 'http://localhost:5173';
}

/** Content-Security-Policy for the WebView. In dev we additionally allow the
 *  vite dev server (module scripts over http + the HMR websocket over ws) --
 *  without this the page loaded from http://localhost:5173 can't fetch its own
 *  bundle and HMR can't connect, so the window stays blank. Production stays
 *  locked to the app scheme only. */
export function buildCsp(
  customScheme: string,
  isDev: boolean,
  devServerUrl?: string | null,
): string {
  if (!isDev) return `default-src ${customScheme}://* 'unsafe-inline' data:`;
  // Allow the ACTUAL dev-server origin (http + ws), not just localhost, so a
  // non-localhost ELECTRON_DEV_SERVER_URL / CAPACITOR_SERVER_URL override (e.g.
  // a LAN IP) isn't CSP-blocked into a blank window.
  const allow = new Set(['http://localhost:*', 'ws://localhost:*']);
  if (devServerUrl) {
    try {
      const u = new URL(devServerUrl);
      allow.add(`${u.protocol}//${u.host}`);
      allow.add(`${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`);
    } catch {
      /* malformed override -- keep the localhost defaults */
    }
  }
  return `default-src ${customScheme}://* ${[...allow].join(' ')} 'unsafe-inline' devtools://* 'unsafe-eval' data:`;
}

/** Whether a navigation target belongs to the app (so will-navigate /
 *  setWindowOpenHandler should allow it). The app scheme is always internal;
 *  in dev the vite dev-server origin is too. Everything else is external
 *  (denied → routed through the Browser plugin / system browser). */
export function isInternalNavigation(
  url: string,
  customScheme: string,
  devServerUrl: string | null,
): boolean {
  if (!url) return false;
  if (url.startsWith(`${customScheme}://`)) return true;
  // Compare parsed ORIGINS, not raw prefixes -- `startsWith(devServerUrl)` would
  // wrongly allow `http://localhost:5173.attacker.tld/...`.
  if (devServerUrl) {
    try {
      return new URL(url).origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  }
  return false;
}
