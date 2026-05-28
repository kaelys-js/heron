/**
 * Root client layout -- controls SSR vs CSR mode.
 *
 * When building for Capacitor (CAPACITOR=1 → adapter-static), every page
 * must render client-side because the WebView has no Node server. The
 * existing +layout.server.ts still loads on Node builds; adapter-static
 * just skips it.
 *
 * For the regular Node build this stays harmless -- ssr remains true by
 * default (this file doesn't override it), so SSR continues to work.
 */
import { browser } from '$app/environment';

// Detect the Capacitor (adapter-static / WebView) build. This MUST fold to a
// static boolean at build time, because SvelteKit reads `ssr` (below) as a
// page option via static analysis -- a non-foldable value makes it default to
// `true`. Vite only inlines VITE_-prefixed vars into import.meta.env, so
// vite.config.ts adds an explicit `define` for PUBLIC_CAPACITOR_BUILD that
// replaces this with a literal "1" / "" at build time.
//
// Regression this guards: when the flag did NOT inline (no define), it was
// `undefined`, so IS_CAPACITOR was always false and `ssr = true` shipped into
// the iOS WebView. SSR-on in a backend-less SPA produces a broken
// adapter-static fallback (empty body to hydrate, unreplaced %sveltekit.head%)
// and a blank/black launch screen -- the original "TestFlight black screen".
const IS_CAPACITOR = import.meta.env.PUBLIC_CAPACITOR_BUILD === '1';

// Lifecycle breadcrumb for the on-device diagnostics overlay (app.html).
// If this never fires on iOS, the SvelteKit client entry module failed to
// evaluate -- a class of failure <svelte:boundary> cannot surface.
if (typeof window !== 'undefined') {
  (globalThis as { __heronDiag?: (m: string) => void }).__heronDiag?.(
    `+layout.ts module evaluated (IS_CAPACITOR=${IS_CAPACITOR})`,
  );
}

export const ssr = !IS_CAPACITOR;
export const prerender = false;
// Trailing slash needs to match fallback: 'index.html' from svelte.config --
// otherwise the WebView fails to load /pipeline/ vs /pipeline.
export const trailingSlash = 'never';

// Merge with parent (+layout.server.ts) data -- DON'T replace it, or downstream
// pages lose access to activeProfile/inboxCount/queueCount/etc.
export const load = async ({ data }) => ({
  ...data,
  isCapacitor: IS_CAPACITOR,
  isBrowser: browser,
});
