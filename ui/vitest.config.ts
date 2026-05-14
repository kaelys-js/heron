/**
 * Vitest base config — defaults consumed by every project in
 * `vitest.workspace.ts`. Re-uses Vite's plugin pipeline (SvelteKit +
 * Tailwind + brand watcher) so test code resolves the same aliases
 * (`$lib/*`, `$app/*`, `$env/*`) and the same Svelte compiler as
 * runtime code.
 *
 * Why a separate config file rather than putting `test` inside
 * `vite.config.ts`:
 *   • SvelteKit's vite plugin doesn't expose a stable way to disable
 *     its server side-effects during `vitest run`. Cleaner to import
 *     it here and let Vitest own the test surface.
 *   • Coverage thresholds live here; production build settings live in
 *     vite.config.ts. Separation prevents accidental coupling.
 *
 * The actual environment + globs per suite are defined in
 * `vitest.workspace.ts`. This file only carries shared bits:
 * setupFiles, coverage policy, alias resolution.
 */
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // NOTE: We deliberately do NOT include the `brandWatcherPlugin` from
  // vite.config.ts. That plugin shells out to `apply-brand.mjs` on every
  // `configResolved()` call — fine for dev/build, but Vitest spawns
  // multiple Vite instances (one per project) and we'd run apply-brand
  // four times per test invocation. Tests assume brand.ts already
  // exists; if it doesn't, `pnpm brand:apply` should be run once
  // before `pnpm test`. The pre-test turbo task graph handles that.
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
      $app: resolve(__dirname, 'src/app'),
    },
  },
  test: {
    // Default environment for cases that don't specify one. Per-project
    // overrides in vitest.workspace.ts.
    environment: 'node',
    // Each test file gets its own module graph so module-singleton
    // `$state` stores can't leak between files. Per-test resets are
    // still required for in-file isolation (see test-helpers/state-helpers).
    isolate: true,
    // Setup runs once per test FILE before any test inside it.
    setupFiles: [resolve(__dirname, 'src/test-setup.ts')],
    // Stop after the first hung file. Keeps CI fast on a real freeze.
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // During early phases many projects/files will have 0 cases until we
    // author them. We want exit 0 in that state so `pnpm test` is green
    // and the coverage gate (which fires AFTER all files run) is the
    // real signal. Once Phase 2 lands and every project has cases, this
    // is harmless — a forgotten test still surfaces as a coverage drop.
    passWithNoTests: true,
    // Reporter set by command-line; default reporter is good for local.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: resolve(__dirname, 'coverage'),
      include: ['src/**/*.{ts,svelte}'],
      exclude: [
        '**/node_modules/**',
        '**/build/**',
        '**/.svelte-kit/**',
        '**/coverage/**',
        '**/dist/**',
        'src/lib/components/ui/**', // bits-ui wrappers — auto-generated
        'src/**/*.config.{ts,js,mjs}',
        'src/**/types.ts',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/test-helpers/**',
        'src/**/*.{test,spec,component.test}.{ts,svelte}',
      ],
      thresholds: {
        // Repo-wide floor — CI red below this.
        lines: 70,
        branches: 65,
        functions: 70,
        statements: 70,
        // Per-file floor so a single ignored file can't drag the suite
        // average up while it sits at 0%.
        perFile: true,
        autoUpdate: false,
      },
      // V8's branch counting includes implicit `?? undefined` chains that
      // exaggerate the denominator. Until we ship Phase 2, accept a
      // slightly more lenient branch threshold via the per-project
      // override below.
    },
  },
});
