<script lang="ts">
  // The dawn-motes particle layer (tsParticles, shared /heron-particles.js
  // bundle) rides ON TOP of the bloom gradients but BEHIND the page content
  // (this whole component sits behind the page's `relative z-10` content).
  import Particles from '$lib/particles/Particles.svelte';
</script>

<!--
  BloomBackground — the centralized dawn-sky "glow" backdrop (the same
  atmosphere the sign-in screen uses). SINGLE SOURCE of the bloom CSS:
  scripts/native/splash-spec.mjs (bloomCssInline), propagated here by
  apply-brand into the AUTO-GENERATED:splash-bloom block below.

  Usage: drop <BloomBackground /> as the FIRST child of any positioned
  (relative / fixed / absolute) full-screen container, then put the page
  content after it (or at a positive z-index) so it sits on top:

      <main class="relative ... overflow-hidden">
        <BloomBackground />
        <div class="relative z-10">…</div>
      </main>

  The layer is absolute inset-0, aria-hidden, and pointer-events-none.
  Regenerate with `pnpm brand:apply`; do NOT hand-edit between the markers.
-->
<!-- AUTO-GENERATED:splash-bloom -->
<div
  aria-hidden="true"
  class="bloom-surface pointer-events-none absolute inset-0 hidden overflow-hidden dark:block"
  style="background: radial-gradient(135% 100% at 50% 50%, transparent 46%, rgba(0, 0, 0, 0.42) 100%), radial-gradient(120% 85% at 50% 116%, rgba(200, 155, 74, 0.17) 0%, rgba(200, 155, 74, 0.06) 30%, transparent 58%), radial-gradient(135% 95% at 50% 104%, rgba(122, 140, 109, 0.1) 0%, transparent 62%), linear-gradient(180deg, #090b0f 0%, #0e1014 44%, #11151c 100%);"
></div>
<div
  aria-hidden="true"
  class="bloom-surface pointer-events-none absolute inset-0 overflow-hidden dark:hidden"
  style="background: radial-gradient(135% 100% at 50% 50%, transparent 58%, rgba(60, 50, 30, 0.07) 100%), radial-gradient(120% 85% at 50% 116%, rgba(200, 155, 74, 0.2) 0%, rgba(200, 155, 74, 0.07) 32%, transparent 60%), radial-gradient(135% 95% at 50% 104%, rgba(122, 140, 109, 0.12) 0%, transparent 64%), linear-gradient(180deg, #ffffff 0%, #f7f5f0 46%, #efece3 100%);"
></div>
<div
  aria-hidden="true"
  class="pointer-events-none absolute inset-0 overflow-hidden"
  style="background-image: url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27300%27%20height%3D%27300%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.85%27%20numOctaves%3D%272%27%20stitchTiles%3D%27stitch%27%2F%3E%3CfeColorMatrix%20type%3D%27saturate%27%20values%3D%270%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url(%23n)%27%2F%3E%3C%2Fsvg%3E'); background-size: 300px 300px; opacity: 0.06; mix-blend-mode: soft-light;"
></div>
<!-- /AUTO-GENERATED:splash-bloom -->
<Particles />
