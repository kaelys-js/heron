<!--
  BackendBootGuard — full-screen LoadingState during first-launch backend
  resolution on Capacitor (iOS/Electron).

  Web mode: backend is always `location.origin` (the page we just loaded),
  so this component shows nothing.

  Capacitor mode: the WebView loaded the static shell from app://. The
  resolver has to figure out where the actual API server is (embedded,
  localhost:5173, LAN mDNS, Tailscale, remote). Until that completes,
  every fetch() in the app would fail. So we block render with a
  branded LoadingState that messages the discovery phase clearly.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { resolveBackend, type ResolvedBackend, pillLabel } from '$lib/client/backend-discovery';
  import { setReporterBackend, reportWarning } from '$lib/client/error-reporter';
  import LoadingState from './LoadingState.svelte';

  let { children } = $props<{ children?: import('svelte').Snippet }>();

  type State =
    | { kind: 'init' }
    | { kind: 'resolving'; phase: string }
    | { kind: 'ready'; resolved: ResolvedBackend }
    | { kind: 'failed'; error: string };

  let state = $state<State>({ kind: 'init' });
  let isCapacitor = $derived(typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());

  onMount(async () => {
    if (!isCapacitor) {
      // Web mode — origin is the backend, nothing to discover.
      state = { kind: 'ready', resolved: { url: location.origin, source: 'embedded', resolvedAt: Date.now() } };
      setReporterBackend(location.origin);
      return;
    }
    state = { kind: 'resolving', phase: 'Looking for your career-ops server…' };
    try {
      const w = globalThis as any;
      const embedded = w?.__CAREER_OPS__?.embeddedUrl;
      const resolved = await resolveBackend({
        embeddedUrl: embedded,
      });
      state = { kind: 'ready', resolved };
      setReporterBackend(resolved.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      state = { kind: 'failed', error: msg };
      void reportWarning(e, { source: 'backend-discovery' });
    }
  });
</script>

{#if state.kind === 'ready'}
  {@render children?.()}
{:else if state.kind === 'init' || state.kind === 'resolving'}
  <LoadingState
    variant="overlay"
    message={state.kind === 'resolving' ? state.phase : 'Starting up…'}
    sub="Trying: embedded → localhost → wifi → Tailscale → remote"
  />
{:else}
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <h1 class="text-xl font-semibold">Can't find your backend</h1>
    <p class="max-w-md text-sm text-muted-foreground">
      None of the discovery sources (embedded, localhost:5173, LAN, Tailscale, remote)
      answered. Open <code>/settings/backend</code> on a web browser to configure a remote URL,
      or run <code>pnpm dev</code> on a Mac on the same wifi.
    </p>
    <p class="text-xs text-rose-400">{state.error}</p>
    <button
      class="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
      onclick={() => location.reload()}
    >
      Retry
    </button>
  </div>
{/if}
