/** Vite config -- brandWatcherPlugin + dev/build settings.
 *  brandWatcherPlugin runs `pnpm brand:apply` once at DEV startup (serve only,
 *  see `apply: 'serve'`) and re-runs on branding/{brand.json,logo.svg} changes
 *  so generated configs (capacitor, Brand.swift, brand.ts, manifest,
 *  favicon, icons) stay fresh while you work. Touched files HMR through
 *  SvelteKit. A production `build` does NOT run it -- the committed generated
 *  files are authoritative and a build must not mutate tracked source.
 *  Server: host:true (0.0.0.0 for iOS-on-LAN), port:5173 + strictPort
 *  (discovery's dev fallback). Build: target es2022 (Capacitor iOS WebView
 *  supports it), sourcemap on, chunkSizeWarningLimit 1500 for bits-ui +
 *  lucide-svelte. */
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const APPLY_BRAND = resolve(REPO_ROOT, 'scripts/native/apply-brand.mjs');
// Surfaced in the Settings "About" card (and the host of the dev-tools opt-in
// gesture). Read from the release-versioned root package.json at config time.
const APP_VERSION: string = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
).version;
// Short git SHA captured at config time. Surfaced in the X-App-Build response
// header, the console boot banner, and Settings so support can pin the EXACT
// build a response/session came from (semver alone can't distinguish two builds
// of the same version). Falls back to '' on a shallow / non-git checkout (e.g.
// a CI tarball) so the build never fails on its absence -- consumers guard for ''.
const APP_BUILD: string = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
})();
const WATCH_FILES = [
  resolve(REPO_ROOT, 'branding/brand.json'),
  resolve(REPO_ROOT, 'branding/logo.svg'),
];

function brandWatcherPlugin(): Plugin {
  let debounceTimer: NodeJS.Timeout | null = null;
  const runApply = (reason: string) => {
    console.log(`[brand-watcher] ${reason} — running apply-brand`);
    try {
      execSync(`node "${APPLY_BRAND}"`, { stdio: 'inherit', cwd: REPO_ROOT });
    } catch (e) {
      console.warn(`[brand-watcher] apply-brand failed: ${(e as Error).message}`);
    }
  };
  return {
    name: 'heron:brand-watcher',
    enforce: 'pre',
    // Dev-only (serve). A production `build` must NOT mutate tracked brand
    // consumers (Brand.swift / brand.ts / icons): the committed generated files
    // are authoritative, brand drift is caught by capacitor.integration + the
    // verify gates, and reproducible builds shouldn't write source. Applying
    // brand on build also raced the tests-dont-mutate-working-tree integrity
    // check under the concurrent verify pipeline (rewrote Brand.swift mid-run).
    apply: 'serve',
    configResolved() {
      runApply('vite startup');
    },
    configureServer(server) {
      for (const f of WATCH_FILES) {
        server.watcher.add(f);
      }
      const onChange = (file: string) => {
        if (!WATCH_FILES.includes(file)) {
          return;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => runApply(`change: ${file}`), 250);
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
    },
  };
}

export default defineConfig({
  // Inline the Capacitor-build flag into import.meta.env. Vite only auto-exposes
  // VITE_-prefixed vars, so `import.meta.env.PUBLIC_CAPACITOR_BUILD` would
  // otherwise be `undefined` even when the build sets PUBLIC_CAPACITOR_BUILD=1.
  // Folding it to a literal here lets +layout.ts's `ssr` page option resolve to
  // a STATIC boolean (SvelteKit reads page options by static analysis; a
  // non-literal defaults to ssr:true → SSR shipped into the WebView → blank
  // screen). Empty string when unset (the adapter-node web build), so ssr stays
  // true there as intended.
  define: {
    'import.meta.env.PUBLIC_CAPACITOR_BUILD': JSON.stringify(
      process.env.PUBLIC_CAPACITOR_BUILD ?? '',
    ),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  plugins: [brandWatcherPlugin(), tailwindcss(), sveltekit()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Filesystem access -- keep strict so the dev server can't accidentally
    // serve files outside the project root (e.g. via `..` paths).
    fs: {
      strict: true,
    },
    // HMR -- let it pick the same port; explicit so a future surprise doesn't
    // break iOS sim re-connection during dev.
    hmr: {
      port: 5173,
    },
    // Warm up the first-paint modules at dev-server startup so the FIRST
    // request (e.g. the desktop shell loading / after vite "ready") doesn't
    // pay the full cold SSR+client transform cost on the critical path. The
    // root layout + the unauthenticated entry pages are what every cold launch
    // hits first, so pre-transforming them shaves seconds off splash -> app.
    warmup: {
      clientFiles: [
        './src/routes/+layout.svelte',
        './src/routes/+page.svelte',
        './src/routes/login/+page.svelte',
      ],
      ssrFiles: ['./src/routes/+layout.server.ts', './src/hooks.server.ts'],
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    // Vite 8 uses rolldown + oxc by default -- fastest production builds.
    // Don't override `minify` (defaults to 'oxc' under rolldown).
    rollupOptions: {
      // Vite 8 / Rolldown uses `onLog` (level, log, defaultHandler) as the
      // canonical hook; `onwarn` is the legacy Rollup name but isn't always
      // routed through SvelteKit's adapter passes. `onLog` covers both
      // bundler passes (client + server) reliably.
      onLog(level, log, defaultHandler) {
        // INEFFECTIVE_DYNAMIC_IMPORT -- Rolldown flags `await import('./x')`
        // when `x` is ALSO statically imported elsewhere. The dynamic
        // imports in orchestrator.ts + apply-linkedin-login.job.ts are
        // INTENTIONAL: they break the `orchestrator ↔ autopilot` circular
        // dependency at module-init time. The warning is correct that no
        // code-splitting happens, but the lazy evaluation still solves the
        // cycle. Silencing here keeps the build output clean.
        if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT') {
          return;
        }
        // INVALID_ANNOTATION -- third-party libs (notably @noble/ciphers,
        // a transitive dep of better-auth) ship `@__NO_SIDE_EFFECTS__`
        // JSDoc annotations in positions Rolldown can't preserve through
        // tree-shaking. Not our code to fix; the comment gets stripped
        // and the build still works.
        if (log.code === 'INVALID_ANNOTATION') {
          return;
        }
        defaultHandler(level, log);
      },
    },
  },
  optimizeDeps: {
    // Force-include heavy deps so vite pre-bundles them once on cold
    // start instead of doing it lazily during route navigation.
    include: ['svelte-sonner', 'marked', 'gray-matter'],
  },
});
