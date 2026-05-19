/**
 * Playwright config -- E2E tests only (separate from the
 * `vitest.workspace.ts` browser project which handles component tests).
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
 */
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // Each spec gets a fresh page; specs are independent so parallel
  // execution is safe.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    // Match the production deployment posture.
    ignoreHTTPSErrors: false,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit covers iOS Safari quirks (Sheet drag-gesture, etc.). Skip in
    // CI to halve runtime -- covered by the Vitest browser project.
    ...(CI ? [] : [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]),
  ],

  webServer: {
    // Build first so `vite preview` serves prod-mode artifacts.
    command: 'pnpm --filter ui run build && pnpm --filter ui exec vite preview --port 4173',
    port: 4173,
    reuseExistingServer: !CI,
    timeout: 180_000, // give the build + preview boot a budget
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
