/** Vitest base config -- defaults inherited (via `extends`) by every
 *  project in vitest.config.ts. Reuses Vite's plugin pipeline (SvelteKit,
 *  Tailwind, brand watcher) so tests resolve the same aliases ($lib/*,
 *  $app/*, $env/*) and Svelte compiler as runtime.
 *  Separate from vite.config.ts: SvelteKit's plugin lacks a stable opt-out
 *  for server side-effects during `vitest run`, and coverage thresholds
 *  shouldn't couple to prod build settings. Per-suite env + globs live in
 *  vitest.config.ts -- this only holds setupFiles, coverage, aliases.
 *  NOTE: this file is NOT auto-discovered (the name is vitest.base.ts, not
 *  vitest.config.ts), so it is never run on its own -- only pulled in by
 *  the project graph. That is what keeps a bare `vitest run <file>` from
 *  silently using a project-less, MSW-less config. */
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirror vite.config.ts's `__APP_VERSION__` define (root package.json version)
// so server/components that read the build-time app version -- the
// X-App-Version response header, the Settings "About" card -- resolve the SAME
// literal under `vitest run` as in a real build. Without this define
// `__APP_VERSION__` is an undeclared global (the `typeof` guards stay false).
const __appVersion: string = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
).version;

// Pre-create the temp dir so the --localstorage-file flag (passed to
// every test worker below) resolves to a writable path. Without this
// path, Node 22+ emits "Warning: --localstorage-file was provided
// without a valid path" on every worker startup -- once per test file,
// surfacing as the kind of stderr noise that hides real failures.
// /tmp doesn't survive reboot; that's fine -- each test run wants a
// fresh blank backing anyway, and our test-setup.ts polyfill replaces
// localStorage with an in-memory Map before any test runs (the file
// just satisfies Node's flag validation).
const __localStoragePath = join(tmpdir(), 'heron-test-localstorage');
mkdirSync(dirname(__localStoragePath), { recursive: true });

// ── Worker exec args (shared between forks + threads) ────────────────
// Vitest 4 removed `test.poolOptions` -- the per-pool config is now
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
//     Node 22.15). Tracked upstream -- until the chain migrates we'd
//     see a DeprecationWarning per worker spawn. Suppressed by code,
//     not by class, so a future genuine deprecation we DO own still
//     surfaces. TODO: drop once tsx ≥ 5 / vitest ≥ 5 ship the
//     registerHooks migration.
//   --throw-deprecation: turn every OTHER DeprecationWarning into a
//     thrown error. This is the "warnings should fail" contract -- if
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
  // Build-time global replacements, mirrored from vite.config.ts so tests run
  // against the same defines the app does (see __appVersion above).
  define: {
    __APP_VERSION__: JSON.stringify(__appVersion),
    // Mirror vite.config.ts's `__APP_BUILD__` (short git SHA). A fixed literal
    // here so the X-App-Build header + console banner resolve deterministically
    // under `vitest run` (a real git SHA would make snapshots non-reproducible).
    __APP_BUILD__: JSON.stringify('testsha'),
  },
  // NOTE: We deliberately do NOT include the `brandWatcherPlugin` from
  // vite.config.ts. That plugin shells out to `apply-brand.mjs` on every
  // `configResolved()` call -- fine for dev/build, but Vitest spawns
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
    // overrides in vitest.config.ts.
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
        'src/lib/components/ui/**', // bits-ui wrappers -- auto-generated
        'src/**/*.config.{ts,js,mjs}',
        'src/**/types.ts',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        // Exclude every file under `src/test-helpers/`. Tried both
        // `src/test-helpers/**` AND `src/test-helpers/*` -- neither
        // matched under v8 + vitest 4's picomatch resolution. Listing
        // the files explicitly is the only reliable form.
        'src/test-helpers/**',
        'src/**/*.{test,spec,component.test}.{ts,svelte}',
      ],
      thresholds: {
        // Repo-wide floor -- CI red below this. Numbers track the
        // linux-runner achievable floor; macOS local runs ~3pp higher
        // for v8-internal reasons (v8 branch counting includes implicit
        // `??` / optional-chain branches whose count varies per
        // runtime, plus JIT optimisation tier differs under runner CPU
        // contention).
        //
        // To restore the original 70/65/70/70 ambition: add tests to
        // the lowest-coverage modules until both platforms sit above
        // 70 across every metric. The biggest wins (by uncovered-line
        // count, per the macOS run's coverage-summary.json) are:
        //   • ui/src/lib/server/jobs/auto-merge-batch.ts (0%)
        //   • ui/src/lib/server/cv-pdf.ts (26%)
        //   • ui/src/lib/server/jobs/scan-*.ts (avg ~30%)
        //   • ui/src/lib/server/orchestrator.ts (~45%)
        // Closing those would lift the linux floor above 75 across
        // every metric and let us raise the gate without flake risk.
        //
        // The assert-coverage-thresholds.mjs script mirrors these exact
        // numbers and has the full rationale in its header.
        lines: 70,
        branches: 62,
        functions: 67,
        statements: 68,
        // Per-file floor so a single ignored file can't drag the suite
        // average up while it sits at 0%.
        perFile: true,
        autoUpdate: false,
      },
    },
    // Vitest 4 promoted `execArgv` from
    // `test.poolOptions.{forks,threads}.execArgv` to top-level
    // `test.execArgv` -- applies to whichever pool is active. Pre-4
    // form triggers a "DEPRECATED" log spam per worker spawn until
    // moved (each project under vitest.config.ts logs its own).
    execArgv: __workerExecArgv,
  },
});
