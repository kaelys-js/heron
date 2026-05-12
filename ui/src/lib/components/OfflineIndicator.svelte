<!--
  OfflineIndicator — banner that slides down from the top when the app
  loses connectivity. Cross-platform (Web / Electron / iOS Capacitor)
  via the shared online-status store.

  Visible state: a thin amber bar at the top of the viewport with
  "Offline — your changes won't save" + a "Retry" button that forces a
  re-probe. When the store flips back to online, the banner fades out
  after a 1s success flash.
-->
<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { WifiOff, Wifi, RotateCw } from '@lucide/svelte';
import { onlineStore } from '$lib/client/online-status';

type Stage = 'hidden' | 'offline' | 'recovered';
let stage = $state<Stage>('hidden');
let recoveredTimer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void) | null = null;

onMount(() => {
  // Seed from current store state
  stage = onlineStore.online ? 'hidden' : 'offline';
  unsub = onlineStore.addListener((online) => {
    if (recoveredTimer) {
      clearTimeout(recoveredTimer);
      recoveredTimer = null;
    }
    if (!online) {
      stage = 'offline';
    } else {
      // Show a 1s "back online" flash, then hide
      stage = 'recovered';
      recoveredTimer = setTimeout(() => {
        stage = 'hidden';
      }, 1500);
    }
  });
});

onDestroy(() => {
  if (recoveredTimer) clearTimeout(recoveredTimer);
  unsub?.();
});

function retry() {
  void onlineStore.refresh();
}
</script>

{#if stage === 'offline'}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-100 backdrop-blur-sm"
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
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-100"
    transition:fade={{ duration: 200 }}
  >
    <Wifi class="size-4" />
    <span>Back online.</span>
  </div>
{/if}
