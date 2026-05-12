<!--
  OfflineIndicator — top-of-viewport banner for cross-platform health.
  Two concerns surfaced here:

    1. Network online/offline (from $lib/client/online-status.svelte).
    2. Backend discovery state (from $lib/client/api-base.ts) — only
       relevant in Capacitor (careerops:// origin), where the WebView
       has to find the backend via mDNS / Tailscale / production fallback.

  Order matters: a hard offline state is shown over a backend-resolving
  state since the latter implies the former. "Looking for backend…" is
  shown only when the cross-origin resolver is actively probing; once
  resolved, the badge fades after 1.5s like the recovered state.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { WifiOff, Wifi, RotateCw, Server, AlertCircle } from '@lucide/svelte';
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

    // Backend status — show the badge whenever the resolver is actively
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
        // a resolving cycle for it — skip the badge entirely.
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
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-100 backdrop-blur-sm pt-safe"
    transition:fly={{ y: -40, duration: 200 }}
  >
    <WifiOff class="size-4" />
    <span><strong>Offline.</strong> Changes won't save until the connection returns.</span>
    {#if onlineStore.reason}
      <span class="text-xs text-amber-200/70">({onlineStore.reason})</span>
    {/if}
    <button
      type="button"
      onclick={retry}
      class="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs hover:bg-amber-500/20"
    >
      <RotateCw class="size-3" />
      Retry
    </button>
  </div>
{:else if stage === 'recovered'}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-100 pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <Wifi class="size-4" />
    <span>Back online.</span>
  </div>
{:else if showBackendBadge && backend.state === 'resolving'}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-100 pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <Server class="size-3.5 animate-pulse" />
    <span>Looking for backend…</span>
  </div>
{:else if showBackendBadge && backend.state === 'error'}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 pt-safe"
    transition:fly={{ y: -40, duration: 200 }}
  >
    <AlertCircle class="size-3.5" />
    <span><strong>Can't find backend.</strong> Make sure your Mac/server is on this network.</span>
    <button
      type="button"
      onclick={retryBackend}
      class="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs hover:bg-red-500/20"
    >
      <RotateCw class="size-3" />
      Retry
    </button>
  </div>
{:else if showBackendBadge && backend.state === 'resolved'}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 pt-safe"
    transition:fade={{ duration: 200 }}
  >
    <Server class="size-3.5" />
    <span>Connected · <strong>{pillLabel(backend.source)}</strong></span>
  </div>
{/if}
