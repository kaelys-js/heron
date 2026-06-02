/**
 * Playwright config -- E2E tests only (separate from the
 * `vitest.config.ts` ui-component browser project which handles component tests).
 *
 * HP5 -- boots `pnpm preview` against the prod build, runs top-down user
 * journey specs from `ui/e2e/**`. CI runs headless; local dev can flip
 * to headed via `--ui` or `--headed`.
 *
 * Why a SEPARATE Playwright config (vs. extending Vitest's browser
 * project): the component tests want jsdom-friendly fast iteration;
 * E2E wants real prod build with hooks.server.ts + DB seeded. Different
 * test runtime, different config, different commands.
 *
 * Run locally:
 *   pnpm --filter ui exec playwright test e2e/
 *   pnpm --filter ui exec playwright test e2e/ --ui   # interactive
 *
 * Run in CI: this config detects CI=1 and switches to headless +
 * retry-on-flake + trace-on-failure.
 *
 * Seed coordination: HERON_E2E_DATA_DIR is computed below (a stable
 * tmpdir path) + exported to process.env so BOTH globalSetup (in this
 * process) AND the webServer (a child process) read the same path.
 * globalSetup creates + seeds it; webServer reads it as HERON_DATA_DIR.
 */

import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { PREVIEW_BASE_URL, PREVIEW_PORT } from './e2e/_helpers/preview-server';

const CI = !!process.env.CI;

// Stable per-run tmpdir for the e2e seed. globalSetup creates this dir
// + seeds auth.db; the webServer reads it as HERON_DATA_DIR via the
// `env:` block below. CI uses a single fixed name per checkout
// (cleaned by globalSetup at start). Local dev keeps the same path so
// `--ui` re-runs against the same seeded state.
const HERON_E2E_DATA_DIR =
  process.env.HERON_E2E_DATA_DIR ?? path.join(os.tmpdir(), CI ? 'heron-e2e-ci' : 'heron-e2e-local');
process.env.HERON_E2E_DATA_DIR = HERON_E2E_DATA_DIR;

export default defineConfig({
  testDir: './e2e',
  // Each spec gets a fresh page; specs are independent so parallel
  // execution is safe.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Per-test budget. The default is 30s; on CI the WebKit-family engines
  // (webkit / mobile-safari) cold-start + reload slower, so give a margin.
  timeout: CI ? 45_000 : 30_000,
  // Parallel workers: CI runs all 5 browser projects in ONE monolithic job
  // (the test.yml E2E step is not sharded). workers=1 there: the runner has
  // 2 cores, and running two WebKit-family browsers (webkit + mobile-safari)
  // concurrently starved each so theme-toggle / mobile-Sheet / web-vitals
  // tests hit the 30s timeout or their internal 5-10s waits. Serial CI runs
  // are slower but stable. Local dev keeps the Playwright default (CPU/2) for
  // snappy reruns. To regain CI parallelism, shard across matrix runners:
  // bump to `workers: 4` and add `--shard ${{ matrix.shard }}/4` in test.yml.
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  // Single-run seed lifecycle. globalSetup populates HERON_E2E_DATA_DIR
  // BEFORE the webServer starts; globalTeardown removes the tmpdir at
  // the end (unless HERON_E2E_PRESERVE=1 is set for debugging).
  globalSetup: './e2e/_helpers/global-setup.ts',
  globalTeardown: './e2e/_helpers/global-teardown.ts',

  use: {
    baseURL: PREVIEW_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    // Match the production deployment posture.
    ignoreHTTPSErrors: false,
  },

  projects: [
    // Cross-browser matrix. The Capacitor wrapper targets WebKit (iOS) +
    // Chromium (Android) at runtime; Firefox catches a small set of
    // engine-specific bugs the other two miss (notably CSS Grid + Date
    // parsing quirks). Mobile variants run device-emulated Chromium +
    // WebKit with the touch-events + viewport sizes that the responsive
    // breakpoints depend on (Sheet drag, mobile drawer, bottom-nav).
    //
    // CI runs ALL 5 projects in one job, serially (workers=1, see above).
    // Local dev runs all 5 too -- the cost is browser boot (~3s/project)
    // but a regression in one engine alone is the most common
    // test-failure shape.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ],

  webServer: {
    // Build first so `vite preview` serves prod-mode artifacts.
    command: `pnpm --filter ui run build && pnpm --filter ui exec vite preview --port ${PREVIEW_PORT}`,
    port: PREVIEW_PORT,
    reuseExistingServer: !CI,
    timeout: 180_000, // give the build + preview boot a budget
    stdout: 'pipe',
    stderr: 'pipe',
    // Pass the seeded HERON_DATA_DIR to the preview server so db/index.ts
    // resolves auth.db + app.db under the tmpdir globalSetup populated.
    // ANTHROPIC_API_KEY placeholder: isFreshInstall() in onboarding.ts
    // gates on the env var; without ANY value the freshInstall branch
    // fires and root redirects to /onboarding/account (not /login).
    // The placeholder never gets used at runtime -- the test paths
    // don't invoke the Anthropic SDK.
    env: {
      HERON_DATA_DIR: HERON_E2E_DATA_DIR,
      ANTHROPIC_API_KEY: 'sk-ant-e2e-placeholder-never-fires',
      // The preview is served over plain HTTP on 127.0.0.1; drop the
      // upgrade-insecure-requests CSP directive so WebKit doesn't rewrite
      // every subresource to https:// and fail the handshake (which silently
      // broke hydration on webkit + mobile-safari). See svelte.config.ts.
      HERON_HTTP_PREVIEW: '1',
    },
  },
});
