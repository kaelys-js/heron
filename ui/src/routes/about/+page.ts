/**
 * /about page options.
 *
 * The About surface is PUBLIC + client-renderable: it must render logged-out
 * (linked from the login/signup footers) and inside the backend-less iOS
 * adapter-static WebView. So it has NO `+page.server.ts` / server `load` -- it
 * reads everything from the compile-time Vite defines (build-info) + the
 * Capacitor bridges (getBuildInfo / deviceInfo) at runtime.
 *
 * `ssr` is inherited from the root +layout.ts (false under the Capacitor build,
 * true on the Node/web build). `prerender = false` matches the layout chain --
 * the adapter-static build serves this via its SPA `index.html` fallback and
 * the client router renders it, so it needs no prerender pass.
 */
export const prerender = false;
