/**
 * Vite config — includes the career-ops `brandWatcherPlugin` that:
 *
 *   • Runs `pnpm brand:apply` once at startup (dev or build) so every
 *     generated config (capacitor.config.ts, Brand.swift, brand.ts,
 *     manifest.webmanifest, favicon.svg, icons.*) is fresh before any
 *     other plugin reads from those files.
 *
 *   • In dev mode, watches `branding/brand.json` + `branding/logo.svg`
 *     and re-runs the propagator on change. Touched files (brand.ts,
 *     manifest.webmanifest) hot-reload through SvelteKit's HMR pipeline.
 *
 * Net result: 100% automated. The user edits brand.json or logo.svg,
 * saves, and the running app + future builds pick up the change with
 * zero manual `pnpm brand:apply` invocations.
 */
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { spawn, execSync } from 'node:child_process';
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
    name: 'career-ops:brand-watcher',
    enforce: 'pre',
    configResolved() {
      // Run once at startup (both dev and build) so the generated files
      // are guaranteed-fresh before SvelteKit's $lib/client/brand etc.
      // load them.
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
});
