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
 * Run in CI: the `ts` job in test.yml runs `pnpm --filter heron-electron
 * test:e2e` under xvfb (Linux needs a display for the real Electron window),
 * path-gated on ui changes like the rest of that job. It is NOT gated behind a
 * feature flag -- it runs for real on every relevant PR.
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
