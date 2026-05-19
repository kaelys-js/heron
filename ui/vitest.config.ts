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
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pre-create the temp dir so the --localstorage-file flag (passed to
// every test worker below) resolves to a writable path. Without this
// path, Node 22+ emits "Warning: --localstorage-file was provided
// without a valid path" on every worker startup — once per test file,
// surfacing as the kind of stderr noise that hides real failures.
// /tmp doesn't survive reboot; that's fine — each test run wants a
// fresh blank backing anyway, and our test-setup.ts polyfill replaces
// localStorage with an in-memory Map before any test runs (the file
// just satisfies Node's flag validation).
const __localStoragePath = join(tmpdir(), 'heron-test-localstorage');
mkdirSync(dirname(__localStoragePath), { recursive: true });

// ── Worker exec args (shared between forks + threads) ────────────────
// Vitest 4 removed `test.poolOptions` — the per-pool config is now
// top-level (`forks:` / `threads:` siblings of `test:`). We keep ONE
// array and re-use it under both pool keys so a future `pool: 'threads'`
// switch picks up the same flags.
//
// Why these flags:
//   --localstorage-file=<path>: Node 22+ emits a warning if anything
//     accesses globalThis.localStorage without a backing path, even
//     when jsdom and our test-setup polyfill the storage object.
//     Pointing at a real tmpdir path silences the warning at the ROOT
//     (Node never warns) rather than masking it with a filter.
//   --disable-warning=ExperimentalWarning: webstorage is still
//     experimental in Node 25/26 even though it works. The warning
//     is documentation, not actionable; suppress per-warning rather
//     than --no-warnings (which would also mask real DeprecationWarning).
//   --disable-warning=DEP0205: tsx + vitest + vite all still call
//     module.register() instead of module.registerHooks() (introduced
//     Node 22.15). Tracked upstream — until the chain migrates we'd
//     see a DeprecationWarning per worker spawn. Suppressed by code,
//     not by class, so a future genuine deprecation we DO own still
//     surfaces. TODO: drop once tsx ≥ 5 / vitest ≥ 5 ship the
//     registerHooks migration.
//   --throw-deprecation: turn every OTHER DeprecationWarning into a
//     thrown error. This is the "warnings should fail" contract — if
//     a new Node deprecation lands in our test surface, the test
//     crashes immediately instead of silently accumulating debt.
//     Pairs with the targeted --disable-warning=DEP0205 above.
const __workerExecArgv = [
  `--localstorage-file=${__localStoragePath}`,
  '--disable-warning=ExperimentalWarning',
  '--disable-warning=DEP0205',
  '--throw-deprecation',
];

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
    // Exit 0 when a project happens to have 0 cases (e.g. when running
    // a single integration test via `pnpm test -- pipeline.integration`).
    // The coverage gate is the real failure signal; a forgotten test
    // file surfaces as a coverage drop, not a vitest failure.
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
      // V8's branch counting includes implicit `?? undefined` chains
      // that exaggerate the denominator — that's why branches: 65 sits
      // lower than the other thresholds.
    },
    // Vitest 4 promoted `execArgv` from
    // `test.poolOptions.{forks,threads}.execArgv` to top-level
    // `test.execArgv` — applies to whichever pool is active. Pre-4
    // form triggers a "DEPRECATED" log spam per worker spawn until
    // moved (each project under vitest.workspace.ts logs its own).
    execArgv: __workerExecArgv,
  },
});
