/**
 * Root client layout — controls SSR vs CSR mode.
 *
 * When building for Capacitor (CAPACITOR=1 → adapter-static), every page
 * must render client-side because the WebView has no Node server. The
 * existing +layout.server.ts still loads on Node builds; adapter-static
 * just skips it.
 *
 * For the regular Node build this stays harmless — ssr remains true by
 * default (this file doesn't override it), so SSR continues to work.
 */
import { browser } from '$app/environment';

// Detect Capacitor build via the env baked in at build time. Vite inlines
// import.meta.env.* at compile time, so PUBLIC_CAPACITOR_BUILD lands as a
// literal "1" / undefined in the static bundle.
const IS_CAPACITOR = import.meta.env.PUBLIC_CAPACITOR_BUILD === '1';

export const ssr = !IS_CAPACITOR;
export const prerender = false;
// Trailing slash needs to match fallback: 'index.html' from svelte.config —
// otherwise the WebView fails to load /pipeline/ vs /pipeline.
export const trailingSlash = 'never';

export const load = async () => {
  return {
    isCapacitor: IS_CAPACITOR,
    isBrowser: browser,
  };
};
