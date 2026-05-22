/**
 * Playwright config for e2e-electron/ -- launches the BUILT Electron
 * app (via @playwright/test's `_electron` driver) and exercises the
 * imperative bootstrap in src/index.ts that's intentionally excluded
 * from Vitest coverage.
 *
 * What this covers (vs. ui/playwright.config.ts which covers the
 * web app): the Electron MAIN process lifecycle -- BrowserWindow
 * creation, deep-link routing into the WebView, tray icon presence,
 * IPC handler responses, electron-updater event wiring.
 *
 * Prerequisites:
 *   pnpm --filter heron-electron run build   # produces build/src/index.js
 *
 * Run locally:
 *   pnpm --filter heron-electron exec playwright test
 *
 * Run in CI: the test.yml `electron-e2e` job runs this on the
 * macos-latest + ubuntu-latest + windows-latest matrix.
 *
 * Failure-tolerance during ramp-up: the suite is gated behind
 * `if: ${{ vars.ELECTRON_E2E_ENABLED == 'true' }}` in CI so a flaky
 * harness doesn't block PRs while the suite stabilizes. Local runs
 * always exercise it. Remove the gate once the suite passes 10
 * consecutive PR runs.
 */
import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e-electron',
  fullyParallel: false, // electron app is a singleton process
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['list']] : 'list',
  timeout: 60_000, // electron cold-start can be slow, esp. on CI

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
  },
});
