/**
 * Single source of truth for the vite-preview host + port the E2E +
 * Lost Pixel + Lighthouse + auth-fixtures stack all consume.
 *
 * Host is 127.0.0.1, NOT `localhost`. Playwright's WebKit driver
 * silently upgrades `http://localhost` -> `https://localhost` for
 * every static-asset request (modulepreload chunks, CSS, JS). The
 * preview server is HTTP-only, so the upgraded HTTPS handshake fails,
 * every module import errors out, and the SvelteKit app never
 * hydrates -- which made every webkit + mobile-safari spec fail
 * silently before this fix. 127.0.0.1 doesn't trigger the upgrade;
 * Chrome / Firefox / mobile-chrome behave identically on both hosts.
 *
 * Imported by:
 *   - ui/playwright.config.ts          (use.baseURL + webServer.url)
 *   - ui/e2e/fixtures/auth-fixtures.ts (request.newContext baseURL)
 *   - ui/lostpixel.config.ts            (pageShots.baseUrl)
 *   - ui/e2e/_helpers/network-mocks.ts  (restoreOnline probe URL)
 *
 * scripts/system/preview-server-port.mjs is the JS twin (literal-
 * mirrored, since ESM cross-import from .ts to .mjs would require a
 * build step we don't have). scripts/system/preview-server-port.test.mjs
 * parses THIS file at test time and fails the runner if the literal
 * drifts -- editing one constant means editing the other, gated by
 * `node --test`.
 */
export const PREVIEW_HOST = '127.0.0.1';
export const PREVIEW_PORT = 4173;
export const PREVIEW_BASE_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;
