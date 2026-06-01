<!--
  Particles — the "dawn motes" background layer for the SvelteKit pages
  (rendered inside BloomBackground, BEHIND the page content). It does NOT import
  tsParticles directly; it loads the ONE shared runtime bundle (/heron-particles.js
  — the same bundle the splash surfaces use) and asks it to mount into the two
  zone divs below. Loading the bundle (rather than importing the engine via Vite)
  keeps tsParticles in a single place and avoids double-bundling.

  Two zones: a top-right cluster and a bottom 20-30% band, matching the splash.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  const SRC = '/heron-particles.js';

  function ensureBundle(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.heronParticles) return Promise.resolve();
    return new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => resolve(), { once: true });
        if (window.heronParticles) resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.addEventListener('load', () => resolve(), { once: true });
      s.addEventListener('error', () => resolve(), { once: true });
      document.head.appendChild(s);
    });
  }

  // onMount (+ its returned cleanup) runs CLIENT-ONLY, so `window` is always
  // defined here. A bare `onDestroy` would also fire during SSR cleanup, where
  // `window` is undefined -- that crashed server rendering of every page that
  // mounts <BloomBackground /> (login/signup/…).
  onMount(() => {
    void ensureBundle().then(() => window.heronParticles?.mount());
    return () => window.heronParticles?.destroy();
  });
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
  <div
    data-heron-particles
    data-zone="top-right"
    data-count="22"
    class="absolute right-0 top-0 h-[44%] w-[48%]"
  ></div>
  <div
    data-heron-particles
    data-zone="bottom"
    data-count="28"
    class="absolute bottom-0 left-0 h-[30%] w-full"
  ></div>
</div>
