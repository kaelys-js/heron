<script lang="ts">
import { notifications } from '$lib/notifications.svelte';
import { Loader2, WifiOff } from '@lucide/svelte';

// Suppress the banner on initial connection — only surface it after a real disconnect,
// OR after >1.5s of stuck "connecting" (server unreachable).
let stuckConnecting = $state(false);
let timer: ReturnType<typeof setTimeout> | null = null;

$effect(() => {
  if (notifications.connected === 'connecting' && !notifications.hasEverConnected) {
    timer = setTimeout(() => {
      stuckConnecting = true;
    }, 1500);
    return () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
  }
  stuckConnecting = false;
});

let visible = $derived(
  (notifications.connected === 'error' && notifications.hasEverConnected) ||
    (notifications.connected === 'connecting' && stuckConnecting),
);
let label = $derived(notifications.connected === 'error' ? 'Reconnecting…' : 'Connecting…');
</script>

{#if visible}
  <div class="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
    {#if notifications.connected === 'error'}
      <WifiOff class="size-3" />
    {:else}
      <Loader2 class="size-3 animate-spin" />
    {/if}
    <span>{label}</span>
  </div>
{/if}
