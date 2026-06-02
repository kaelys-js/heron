/**
 * esbuild entry for the standalone `static/heron-particles.js` IIFE bundle.
 * This is the SINGLE shared particle runtime: the SvelteKit pages, the app.html
 * boot-fallback splash, and the inlined Electron splash all load this one bundle
 * so the effect is identical everywhere.
 *
 * Exposes `window.heronParticles.{mount,destroy}` so SvelteKit (which re-renders
 * the host divs on client navigation) can re-mount after the bundle has loaded,
 * and auto-mounts once on initial load for the static/splash surfaces.
 */
import { mountHeronParticles, destroyHeronParticles } from './mount';

declare global {
  interface Window {
    heronParticles?: { mount: () => Promise<void>; destroy: () => void };
  }
}

window.heronParticles = { mount: mountHeronParticles, destroy: destroyHeronParticles };

function go(): void {
  void mountHeronParticles();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', go);
} else {
  go();
}
