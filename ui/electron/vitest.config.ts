/** vitest config for the electron workspace -- no source-level tests
 *  yet. The main vitest config (ui/vitest.config.ts) sets a 70%
 *  coverage gate, and without this file electron's `vitest run
 *  --coverage` walks up the directory tree and inherits that gate.
 *  With no tests, every file lands at 0% and pre-push fails with
 *  "Coverage for X does not meet threshold" -- which is misleading
 *  (electron just doesn't have tests yet, not a regression).
 *
 *  TODO: when electron tests land, lift the thresholds match ui/. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      // No thresholds -- electron has no source-level tests yet.
      // When tests land, sync these with ui/vitest.config.ts.
      thresholds: undefined,
    },
  },
});
