/**
 * Single source of truth for the vite-preview port the E2E + Lost
 * Pixel + Lighthouse + auth-fixtures stack all consume.
 *
 * Imported by:
 *   - ui/playwright.config.ts          (use.baseURL)
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
 *
 * Why a constant rather than env-only: tests at runtime read the
 * compiled .ts module via Vitest/Playwright. Hard-coded literal is
 * trivial to grep + greps to one place; envify only when CI needs
 * to override.
 */
export const PREVIEW_PORT = 4173;
export const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}`;
