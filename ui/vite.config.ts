/**
 * Vite config -- Heron `brandWatcherPlugin` + best-practice dev/build
 * settings.
 *
 * `brandWatcherPlugin`:
 *   • Runs `pnpm brand:apply` once at startup (dev or build) so every
 *     generated config (capacitor.config.ts, Brand.swift, brand.ts,
 *     manifest.webmanifest, favicon.svg, icons.*) is fresh before any
 *     other plugin reads from those files.
 *   • In dev mode, watches `branding/brand.json` + `branding/logo.svg`
 *     and re-runs the propagator on change. Touched files (brand.ts,
 *     manifest.webmanifest) hot-reload through SvelteKit's HMR pipeline.
 *
 * Net result: 100% automated. The user edits brand.json or logo.svg,
 * saves, and the running app + future builds pick up the change with
 * zero manual `pnpm brand:apply` invocations.
 *
 * Server settings:
 *   • `host: true` -- listens on every interface (0.0.0.0). Required so
 *     an iOS device on the same wifi can hit the dev server via the
 *     Mac's LAN IP / Bonjour. Single-user job tool; LAN exposure is OK.
 *   • `port: 5173` -- explicit, matches backend-discovery's dev fallback.
 *   • `strictPort: true` -- fail loud if 5173 is taken, don't silently
 *     fall through to 5174 (would break discovery).
 *
 * Build settings:
 *   • `target: 'es2022'` -- Capacitor iOS WebView supports ES2022. Avoids
 *     transpiling features Electron and modern Safari handle natively.
 *   • `sourcemap: true` -- small overhead, big debugging win.
 *   • `chunkSizeWarningLimit: 1500` -- Heron bundles a few heavy
 *     dependencies (bits-ui + lucide-svelte) that legitimately push the
 *     default 500kb chunk warning.
 */
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const APPLY_BRAND = resolve(REPO_ROOT, 'scripts/native/apply-brand.mjs');
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
    configResolved() {
      runApply('vite startup');
    },
    configureServer(server) {
      for (const f of WATCH_FILES) {
        server.watcher.add(f);
      }
      const onChange = (file: string) => {
        if (!WATCH_FILES.includes(file)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runApply(`change: ${file}`), 250);
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
    },
  };
}

export default defineConfig({
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
        if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
        // INVALID_ANNOTATION -- third-party libs (notably @noble/ciphers,
        // a transitive dep of better-auth) ship `@__NO_SIDE_EFFECTS__`
        // JSDoc annotations in positions Rolldown can't preserve through
        // tree-shaking. Not our code to fix; the comment gets stripped
        // and the build still works.
        if (log.code === 'INVALID_ANNOTATION') return;
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
