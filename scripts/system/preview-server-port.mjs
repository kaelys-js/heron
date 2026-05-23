/**
 * JS mirror of ui/e2e/_helpers/preview-server.ts -- duplicates the
 * literal host + port + URL since .ts can't be imported from .mjs
 * without a build step. preview-server-port.test.mjs parses the TS
 * file + asserts equality, so divergence fails the test runner. Host
 * is 127.0.0.1 (not localhost) because Playwright WebKit upgrades
 * http://localhost -> https://localhost for static assets; see the
 * TS file's docstring for the full rationale. Edit both files
 * together.
 */
export const PREVIEW_HOST = '127.0.0.1';
export const PREVIEW_PORT = 4173;
export const PREVIEW_BASE_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;
