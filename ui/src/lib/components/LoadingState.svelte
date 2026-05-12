<!--
  LoadingState — standard loading/waiting UI.

  One component for every async wait state across the app:

    <LoadingState message="Discovering backend..." />          ← spinner + text
    <LoadingState message="..." progress={0.6} />              ← spinner + progress bar
    <LoadingState variant="skeleton" rows={3} />               ← skeleton placeholder
    <LoadingState variant="inline" />                          ← small inline spinner
    <LoadingState variant="overlay" message="Building..." />   ← full-screen overlay

  The fullscreen overlay is what shows during backend-discovery first
  boot (Capacitor apps) so the user sees "Connecting to your desktop..."
  instead of a blank white screen.
-->
<script lang="ts">
import { Loader2 } from '@lucide/svelte';
import { fade } from 'svelte/transition';
import { BRAND } from '$lib/client/brand';

type Variant = 'inline' | 'block' | 'overlay' | 'skeleton';

let {
  variant = 'block' as Variant,
  message = 'Loading…',
  sub,
  progress, // 0..1 number → renders a progress bar
  rows = 3, // skeleton variant: number of rows
  size = 'md' as 'sm' | 'md' | 'lg',
} = $props<{
  variant?: Variant;
  message?: string;
  sub?: string;
  progress?: number | null;
  rows?: number;
  size?: 'sm' | 'md' | 'lg';
}>();

const iconClass = $derived(size === 'sm' ? 'size-4' : size === 'lg' ? 'size-12' : 'size-8');
</script>

{#if variant === 'inline'}
  <span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
    <Loader2 class="{iconClass} animate-spin" />
    {message}
  </span>
{:else if variant === 'overlay'}
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    role="status"
    aria-live="polite"
  >
    <div class="flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card px-8 py-6 shadow-lg">
      <Loader2 class="size-10 animate-spin text-primary" />
      <div class="text-center">
        <p class="font-medium text-foreground">{message}</p>
        {#if sub}
          <p class="mt-1 text-xs text-muted-foreground">{sub}</p>
        {/if}
      </div>
      {#if progress != null}
        <div class="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full bg-primary transition-all"
            style="width: {Math.max(0, Math.min(1, progress)) * 100}%"
          ></div>
        </div>
      {/if}
      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">
        {BRAND.displayName}
      </p>
    </div>
  </div>
{:else if variant === 'skeleton'}
  <div class="space-y-2" aria-busy="true" aria-live="polite">
    {#each Array(rows) as _, i}
      <div
        class="h-4 w-full animate-pulse rounded bg-muted/60"
        style="width: {100 - (i % 3) * 10}%"
      ></div>
    {/each}
  </div>
{:else}
  <div
    class="flex flex-col items-center justify-center gap-2 py-8 text-center"
    role="status"
    aria-live="polite"
  >
    <Loader2 class="{iconClass} animate-spin text-muted-foreground" />
    <div>
      <p class="text-sm font-medium text-foreground">{message}</p>
      {#if sub}
        <p class="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      {/if}
    </div>
    {#if progress != null}
      <div class="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full bg-primary transition-all"
          style="width: {Math.max(0, Math.min(1, progress)) * 100}%"
        ></div>
      </div>
    {/if}
  </div>
{/if}
