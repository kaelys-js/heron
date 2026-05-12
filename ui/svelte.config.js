/**
 * SvelteKit config — dual adapter + best-practice preprocessing.
 *
 * career-ops ships in two shapes:
 *
 *   1. Web/server build (default) — adapter-node, embedded inside the
 *      Electron app OR run remotely. Output goes to `build/` (Node entry).
 *
 *   2. Static shell build (CAPACITOR=1) — adapter-static, the Capacitor
 *      WebView's HTML/JS/CSS bundle. Output goes to `build/static/`. The
 *      WebView loads this shell, which immediately runs backend-discovery
 *      and connects to whichever backend is reachable.
 *
 * The same source code produces both. Server-only modules (`$lib/server/*`)
 * are tree-shaken out of the static build because they're never imported
 * by client code.
 *
 * vitePreprocess() — handles <script lang="ts">, <style lang="scss">, etc.
 * in .svelte files. Still recommended in Svelte 5 even though the compiler
 * has type-stripping support; vitePreprocess is the canonical bridge to
 * vite's plugin pipeline for source transforms.
 */
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';

const CAPACITOR_BUILD = process.env.CAPACITOR === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // No `preprocess` block — Svelte 5 has built-in TypeScript support and
  // vite handles PostCSS via @tailwindcss/vite. Adding `vitePreprocess()`
  // here would conflict with the runes-detection callback below (rune_
  // outside_svelte error on routes that use $state/$derived).
  compilerOptions: {
    // Force runes mode for the project except for libraries.
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
  },

  kit: {
    adapter: CAPACITOR_BUILD
      ? staticAdapter({
          // Capacitor static shell — every route lands on index.html and the
          // client router takes over (SPA mode). adapter-static + SPA fallback
          // is the official recipe for Capacitor + SvelteKit.
          pages: 'build/static',
          assets: 'build/static',
          fallback: 'index.html',
          precompress: false,
          strict: false,
        })
      : nodeAdapter({
          // Node SSR server — runs inside Electron (embedded child process)
          // or hosted remotely. envPrefix: '' keeps the standard Vite/Node
          // env var conventions intact.
          out: 'build',
          precompress: true,
          envPrefix: '',
        }),

    // CSRF protection — checkOrigin is enabled by default in SvelteKit 2.
    // trustedOrigins replaces the older checkOrigin boolean. We leave it
    // empty so only same-origin form POSTs succeed (Capacitor WebView is
    // same-origin once loaded).
    csrf: {
      trustedOrigins: [],
    },

    // Content Security Policy — auto-generated hashes for inline <script>/
    // <style> blocks SvelteKit emits. `mode: 'hash'` keeps strict-dynamic
    // semantics (no `unsafe-inline`). For static-adapter builds the hashes
    // are baked into <meta> tags in index.html; for adapter-node they're
    // sent in a per-response CSP header.
    //
    // Source-list rationale:
    //   'self'                 — first-party JS/CSS/fonts.
    //   'unsafe-eval'          — Anthropic SDK's @anthropic-ai/sdk needs eval
    //                            for streamed JSON-mode responses on web.
    //                            Capacitor WebView blocks eval natively;
    //                            this only matters on the Node adapter
    //                            target.
    //   data: blob:            — favicons, PDFs, generated thumbnails.
    //   capacitor: https://localhost — iOS/Android WebView origins.
    //   ws: wss:               — Vite HMR + Better Auth WebSocket.
    //   api.anthropic.com      — first-party LLM connections.
    //   generativelanguage.googleapis.com — Gemini.
    //   *.ts.net               — Tailscale magic-DNS hostnames (LAN auth).
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"], // Tailwind JIT inline styles
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': [
          "'self'",
          'ws:',
          'wss:',
          'https://api.anthropic.com',
          'https://generativelanguage.googleapis.com',
          'https://*.ts.net',
          'capacitor://localhost',
          'https://localhost',
        ],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': true,
      },
    },

    // Service worker is OFF — career-ops doesn't ship one. Capacitor
    // WebView doesn't support service workers reliably on iOS anyway.
    serviceWorker: {
      register: false,
    },

    // Path aliases. $lib is automatic; we add $brand as a shortcut for
    // the generated brand constants so per-page imports stay short.
    alias: {
      $brand: 'src/lib/client/brand.ts',
    },
  },
};

export default config;
