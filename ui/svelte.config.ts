/** SvelteKit config -- dual adapter.
 *  1. Web/server (default): adapter-node, embedded in Electron OR run
 *     remotely; output → build/.
 *  2. Static shell (CAPACITOR=1): adapter-static, the Capacitor WebView
 *     bundle (build/static/) that boots backend-discovery on load.
 *  Same source produces both -- `$lib/server/*` tree-shakes out of static.
 *  vitePreprocess handles <script lang="ts"> etc; still the canonical
 *  bridge to Vite's transform pipeline in Svelte 5. */
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import type { Config } from '@sveltejs/kit';

const CAPACITOR_BUILD = process.env.CAPACITOR === '1';
// Vite dev server (`pnpm dev`, `pnpm dev:ios --live`, etc.) -- disables
// CSP because SvelteKit's `mode: 'auto'` only nonces its OWN injected
// bootstrap script and leaves custom inline scripts in app.html (theme
// bootstrap, the boot-fallback's blank-screen guard + safety-net,
// Console Ninja's IDE bridge, speculationrules) unsigned, which causes
// the browser to refuse to execute them. The Capacitor WebView in
// --live mode loads from Vite, so it inherits this CSP and the WebView
// renders the SSR'd HTML but never hydrates -- the login screen never
// appears. Production node builds keep strict CSP.
const DEV_MODE = process.env.NODE_ENV !== 'production';
// E2E / Lighthouse / Lost Pixel build a production bundle but serve it via
// `vite preview` over PLAIN HTTP on 127.0.0.1. The `upgrade-insecure-requests`
// CSP directive makes a conforming engine rewrite every http:// subresource
// to https://; with no TLS listener on the preview port the modulepreload /
// CSS / JS requests fail the handshake ("A TLS error caused the secure
// connection to fail"), the SvelteKit app never hydrates, onMount never runs,
// and every webkit + mobile-safari spec fails silently. Chromium exempts
// loopback from the upgrade so it only bites WebKit. Setting
// HERON_HTTP_PREVIEW=1 for the preview build drops ONLY this directive; the
// rest of the strict CSP stays under test, and production (served over HTTPS)
// keeps the directive as defence-in-depth.
const HTTP_PREVIEW = process.env.HERON_HTTP_PREVIEW === '1';

const config: Config = {
  // No `preprocess` block -- Svelte 5 has built-in TypeScript support and
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
          // Capacitor static shell -- every route lands on index.html and the
          // client router takes over (SPA mode). adapter-static + SPA fallback
          // is the official recipe for Capacitor + SvelteKit.
          pages: 'build/static',
          assets: 'build/static',
          fallback: 'index.html',
          precompress: false,
          strict: false,
        })
      : nodeAdapter({
          // Node SSR server -- runs inside Electron (embedded child process)
          // or hosted remotely. envPrefix: '' keeps the standard Vite/Node
          // env var conventions intact.
          out: 'build',
          precompress: true,
          envPrefix: '',
        }),

    // CSRF protection -- checkOrigin is enabled by default in SvelteKit 2.
    // trustedOrigins replaces the older checkOrigin boolean. We leave it
    // empty so only same-origin form POSTs succeed (Capacitor WebView is
    // same-origin once loaded).
    csrf: {
      trustedOrigins: [],
    },

    // Content Security Policy -- auto-generated hashes for inline <script>/
    // <style> blocks SvelteKit emits. `mode: 'hash'` keeps strict-dynamic
    // semantics (no `unsafe-inline`). For static-adapter builds the hashes
    // are baked into <meta> tags in index.html; for adapter-node they're
    // sent in a per-response CSP header.
    //
    // Source-list rationale:
    //   'self'                 -- first-party JS/CSS/fonts.
    //   'unsafe-eval'          -- Anthropic SDK's @anthropic-ai/sdk needs eval
    //                            for streamed JSON-mode responses on web.
    //                            Capacitor WebView blocks eval natively;
    //                            this only matters on the Node adapter
    //                            target.
    //   data: blob:            -- favicons, PDFs, generated thumbnails.
    //   capacitor: https://localhost -- iOS/Android WebView origins.
    //   ws: wss:               -- Vite HMR + Better Auth WebSocket.
    //   api.anthropic.com      -- first-party LLM connections.
    //   generativelanguage.googleapis.com -- Gemini.
    //   *.ts.net               -- Tailscale magic-DNS hostnames (LAN auth).
    // CSP is OFF for the Capacitor static build. SvelteKit only hashes
    // its own injected bootstrap inline script -- custom inline scripts
    // in app.html (theme bootstrap, speculationrules) do NOT get added
    // to the hash list, so a strict script-src CSP blocks them, which
    // in turn blocks the SvelteKit bootstrap from ever running and the
    // WebView shows a blank white page forever. The Capacitor WebView's
    // origin is the app bundle itself (heron://localhost) -- there's
    // no third-party origin that can inject scripts, so CSP adds little
    // defence in depth here. The adapter-node (server) build still gets
    // strict CSP via a per-response header set in hooks.server.ts.
    csp:
      CAPACITOR_BUILD || DEV_MODE
        ? undefined
        : {
            mode: 'auto',
            directives: {
              'default-src': ["'self'"],
              // 'sha256-...' entries pin our three inline scripts in
              // `app.html` (theme bootstrap, speculationrules block,
              // blank-screen guard). SvelteKit's `mode: 'auto'` hashes
              // ONLY scripts SvelteKit itself injects via `<svelte:head>`
              // -- it doesn't scan `app.html` -- so we maintain these
              // hashes manually. They MUST be re-computed when any of
              // those three blocks changes; helper:
              //
              //   python3 -c "import hashlib,base64;
              //     html=open('ui/src/app.html').read();
              //     import re;
              //     [print('sha256-'+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode())
              //      for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S)]"
              //
              // If you forget to bump the hash after editing one of the
              // inline blocks, Lighthouse's `errors-in-console` audit
              // fires with "Executing inline script violates the
              // following CSP directive" and the page silently breaks
              // (theme bootstrap won't run, etc).
              'script-src': [
                "'self'",
                "'unsafe-eval'",
                "'wasm-unsafe-eval'",
                "'sha256-MegZb3SbZVAzUiaf6ATlJAKhkmCEkr6O499YSuBjk14='", // theme bootstrap
                "'sha256-AXMfZ0Qft2fuay5SZHCsOAG2dtpQN7X51WmFaMr33hA='", // speculationrules
                "'sha256-nqbTk2C9AYxK2aim7Dorj8PN4hj4Fa6SueN00fDGZPg='", // app.html bootstrap + diagnostics
                "'sha256-ctdFQ0DAi7RYIXKN3mXFXyP6e30ct5aV+fwqy3FMS4o='", // boot-fallback UX driver
              ],
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
              // Omitted for the HTTP preview build (see HTTP_PREVIEW above);
              // kept as defence-in-depth for the HTTPS production build.
              ...(HTTP_PREVIEW ? {} : { 'upgrade-insecure-requests': true }),
            },
          },

    // Service worker is OFF -- Heron doesn't ship one. Capacitor
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
