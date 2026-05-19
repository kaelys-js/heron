/**
 * Vitest workspace -- four projects per intended runtime:
 *
 *   ui-unit       jsdom    Pure-logic + state-store cases (lib/**)
 *   ui-server     node     SvelteKit endpoints + server modules
 *   ui-component  browser  Real-DOM component cases (Playwright/Chromium)
 *   ui-routes     jsdom    Page-level smoke (load fns, layout state)
 *
 * Why split:
 *   • Server modules import `$env/dynamic/private`, `node:fs`, and
 *     better-sqlite3 -- jsdom doesn't help them and would actively hurt
 *     (better-sqlite3 segfaults under jsdom's polyfilled Buffer).
 *   • Components depend on real `matchMedia` and `getBoundingClientRect`
 *     for the responsive primitive sweep. jsdom's stubs are insufficient.
 *   • Unit tests want jsdom's `document` for testing DOM helpers but
 *     don't need a real browser -- the slowest layer is browser bootstrap,
 *     so reserve it for what needs it.
 *
 * The `extends` field re-uses everything from `vitest.config.ts`
 * (alias, coverage, setupFiles). Each project only overrides the
 * environment + glob.
 */
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      // ── ui-unit ────────────────────────────────────────────────────
      {
        extends: './vitest.config.ts',
        test: {
          name: 'ui-unit',
          environment: 'jsdom',
          include: ['src/lib/**/*.test.ts'],
          exclude: [
            'src/lib/server/**',
            // ANY .component.test.ts goes to ui-component, regardless of
            // where it sits in the tree. Wide glob to be safe.
            'src/**/*.component.test.ts',
            'src/**/*.svelte.test.ts',
            'src/lib/integration/**',
          ],
        },
      },

      // ── ui-server ──────────────────────────────────────────────────
      {
        extends: './vitest.config.ts',
        test: {
          name: 'ui-server',
          environment: 'node',
          include: [
            'src/lib/server/**/*.test.ts',
            'src/routes/api/**/*.test.ts',
            'src/hooks.server.test.ts',
          ],
        },
      },

      // ── ui-component ───────────────────────────────────────────────
      // Real-browser component tests. Vitest 4 derives
      // `environment: 'browser'` from `browser.enabled: true` -- setting
      // both errors out. We run both Chromium and WebKit so any test
      // that exercises pointer-event gestures (bits-ui Sheet drag, etc.)
      // catches Safari/iOS-specific quirks the same day a regression
      // lands.
      {
        extends: './vitest.config.ts',
        test: {
          name: 'ui-component',
          include: ['src/**/*.component.test.ts', 'src/**/*.svelte.test.ts'],
          browser: {
            enabled: true,
            // Vitest 4's default `headless` is `process.env.CI` -- locally
            // that's undefined → falsy → window opens. The playwright()
            // factory's `headless` option does NOT propagate to this
            // top-level setting; it has to be set HERE on the browser
            // config. Default to headless always; opt in to a visible
            // window with `BROWSER_HEAD=1 pnpm test`.
            headless: !process.env.BROWSER_HEAD,
            // Vitest 4 takes a provider factory, not a string. The
            // `playwright()` factory from @vitest/browser-playwright
            // returns a provider instance.
            provider: playwright({
              // Headless config is read from the parent `browser.headless`
              // above (see node_modules/@vitest/browser-playwright/dist/
              // index.js -- `headless: options.headless`). launchOptions
              // is reserved for additional Playwright args.
              launchOptions: {},
            }),
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
            // Vitest 4 + Playwright provider talks to the browser over a
            // local websocket; the default port works fine on a dev box,
            // but pin one so CI parallelism doesn't collide.
            api: 6133,
          },
        },
      },

      // ── ui-routes ──────────────────────────────────────────────────
      {
        extends: './vitest.config.ts',
        test: {
          name: 'ui-routes',
          environment: 'jsdom',
          include: ['src/routes/**/*.test.ts'],
          exclude: ['src/routes/api/**'],
        },
      },

      // ── ui-integration ─────────────────────────────────────────────
      // Structural + integration assertions that touch real files at
      // repo root (apply / backup / capacitor / cleanup / deep-links /
      // multi-user / pipeline / post-apply / toolchain-versions, plus
      // the vitest-config regression guard).
      {
        extends: './vitest.config.ts',
        test: {
          name: 'ui-integration',
          environment: 'node',
          include: ['src/lib/integration/**/*.integration.test.ts'],
          // Integration cases shell out to real binaries (node, git, etc.)
          // -- bump the budget so a real `pnpm build` smoke fits.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
