/**
 * preview-server-port.mjs -- JS mirror of ui/e2e/_helpers/preview-server.ts.
 *
 * The TypeScript constant can't be imported from .mjs without a build
 * step, so this file duplicates the literal port + URL. The drift
 * gate in preview-server-port.test.mjs parses the TS file at test
 * time + asserts equality, so a divergence fails the test runner
 * before it can cause a port-mismatch in inject-lighthouse-auth.mjs.
 *
 * Edit BOTH files together. The drift test makes silent divergence
 * impossible to merge.
 */
export const PREVIEW_PORT = 4173;
export const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}`;
