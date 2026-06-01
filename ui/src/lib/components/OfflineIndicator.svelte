<!--
  OfflineIndicator — top-of-viewport banner for cross-platform health.
  Two concerns surfaced here:

    1. Network online/offline (from $lib/client/online-status.svelte).
    2. Backend discovery state (from $lib/client/api-base.ts) — only
       relevant in Capacitor (heron:// origin), where the WebView
       has to find the backend via mDNS / Tailscale / production fallback.

  Order matters: a hard offline state is shown over a backend-resolving
  state since the latter implies the former. "Looking for backend…" is
  shown only when the cross-origin resolver is actively probing; once
  resolved, the badge fades after 1.5s like the recovered state.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  // Lucide icon imports removed -- the pills now use a colored dot
  // (1.5px-radius circle styled inline) as the status indicator
  // instead of Lucide glyphs. Avoids the cluttered "wifi icon +
  // text + retry icon" look the previous design had.
  import { onlineStore } from '$lib/client/online-status.svelte';
  import {
    onBackendStatusChange,
    getBackendStatus,
    getApiBase,
    resetApiBase,
    type BackendStatus,
  } from '$lib/client/api-base';
  import { pillLabel } from '$lib/client/backend-discovery';

  type Stage = 'hidden' | 'offline' | 'recovered';
  let stage = $state<Stage>('hidden');
  let backend = $state<BackendStatus>(getBackendStatus());
  let recoveredTimer: ReturnType<typeof setTimeout> | null = null;
  let backendBadgeTimer: ReturnType<typeof setTimeout> | null = null;
  let showBackendBadge = $state(false);
  let unsub: (() => void) | null = null;
  let unsubBackend: (() => void) | null = null;

  onMount(() => {
    stage = onlineStore.online ? 'hidden' : 'offline';
    unsub = onlineStore.addListener((online) => {
      if (recoveredTimer) {
        clearTimeout(recoveredTimer);
        recoveredTimer = null;
      }
      if (!online) {
        stage = 'offline';
      } else {
        stage = 'recovered';
        recoveredTimer = setTimeout(() => {
          stage = 'hidden';
        }, 1500);
      }
    });

    // Backend status -- show the badge whenever the resolver is actively
    // probing or has errored. On resolved, show briefly for confirmation,
    // then hide. Idle (web same-origin) never shows.
    unsubBackend = onBackendStatusChange((s) => {
      backend = s;
      if (backendBadgeTimer) {
        clearTimeout(backendBadgeTimer);
        backendBadgeTimer = null;
      }
      if (s.state === 'resolving' || s.state === 'error') {
        showBackendBadge = true;
      } else if (s.state === 'resolved') {
        // Same-origin web: source==='embedded' AND we never started
        // a resolving cycle for it -- skip the badge entirely.
        if (showBackendBadge) {
          backendBadgeTimer = setTimeout(() => {
            showBackendBadge = false;
          }, 1500);
        }
      } else {
        showBackendBadge = false;
      }
    });

    // Re-resolve backend when the tab/app returns to foreground after a
    // long background. iOS WebViews especially can sit in the background
    // for hours; the cached LAN IP may have moved. Threshold: 30s.
    let lastForeground = Date.now();
    function onVisibility() {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastForeground > 30_000) {
          resetApiBase();
          void getApiBase().catch(() => {
            /* error state already surfaced via listener */
          });
        }
        lastForeground = Date.now();
      } else {
        lastForeground = Date.now();
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  });

  onDestroy(() => {
    if (recoveredTimer) clearTimeout(recoveredTimer);
    if (backendBadgeTimer) clearTimeout(backendBadgeTimer);
    unsub?.();
    unsubBackend?.();
  });

  function retry() {
    void onlineStore.refresh();
  }

  function retryBackend() {
    resetApiBase();
    void getApiBase().catch(() => {});
  }
</script>

{#if stage === 'offline'}
  <!--
    Network / backend status pills — minimal, professional, modern.
    Design:
      • Tiny floating pill at top center. No full-width banner; no
        inline "Retry" label or arrow icon (the previous ↻ read
        cluttered and old-fashioned).
      • Error states are entirely clickable BUTTONS — the whole pill
        IS the retry surface. Modern iOS pattern: status indicators
        like Slack's "Connecting" or Apple's network status pill have
        no inline button glyph; the affordance comes from how the
        pill changes when you tap it.
      • Active state SCALES + brightens (subtle: scale-95) so the
        tap registers tactically. Spec keyword: `active:` Tailwind
        state, no transition spinner — kept calm, not flashy.
      • Copy describes the SPECIFIC failure: "Disconnected · Tap to
        retry" beats "Your Mac is offline" (vague — which Mac?
        offline how?). Connecting state says "Connecting" — single
        word, universally understood, no anthropomorphising the
        server.
      • Wrapper is pointer-events: none so it never blocks taps on
        content underneath; only the pill itself receives clicks.
  -->
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
    transition:fly={{ y: -20, duration: 200 }}
  >
    <button
      type="button"
      onclick={retry}
      class="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary backdrop-blur-md transition-all duration-150 hover:bg-primary/25 active:scale-[0.97] active:bg-primary/35"
      aria-label="Offline — tap to retry"
    >
      <span class="size-1.5 rounded-full bg-primary/90"></span>
      Offline · Tap to retry
    </button>
  </div>
{:else if stage === 'recovered'}
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-100 backdrop-blur-md"
    >
      <span class="size-1.5 rounded-full bg-emerald-400/90"></span>
      Online
    </div>
  </div>
{:else if showBackendBadge && backend.state === 'resolving'}
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-[11px] font-medium text-blue-100 backdrop-blur-md"
    >
      <span class="size-1.5 animate-pulse rounded-full bg-blue-400/90"></span>
      Connecting
    </div>
  </div>
{:else if showBackendBadge && backend.state === 'error'}
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
    transition:fly={{ y: -20, duration: 200 }}
  >
    <button
      type="button"
      onclick={retryBackend}
      class="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-[11px] font-medium text-red-100 backdrop-blur-md transition-all duration-150 hover:bg-red-500/25 active:scale-[0.97] active:bg-red-500/35"
      aria-label="Disconnected from server — tap to retry"
    >
      <span class="size-1.5 rounded-full bg-red-400/90"></span>
      Disconnected · Tap to retry
    </button>
  </div>
{:else if showBackendBadge && backend.state === 'resolved'}
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-100 backdrop-blur-md"
    >
      <span class="size-1.5 rounded-full bg-emerald-400/90"></span>
      Connected · {pillLabel(backend.source)}
    </div>
  </div>
{/if}
