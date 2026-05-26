<!--
  BackendBootGuard — full-screen gate during first-launch backend
  resolution on Capacitor (iOS/Electron).

  Web mode: backend is always `location.origin` (the page we just loaded),
  so this component renders children immediately (no gate, no flash).

  Capacitor mode: the WebView loaded the static shell from `heron://`. The
  resolver figures out where the API server is (embedded → dev → LAN mDNS
  → Tailscale → remote). Until that resolves, every fetch() would fail, so
  we block render with a branded waiting state, then either the app or an
  actionable "can't connect" screen. Visual language matches
  BackendUnreachableOverlay + the native/boot-fallback splash so the user
  perceives one continuous "getting things ready" narrative.

  Retry/Connect deliberately keep THIS dark card on screen (button busy
  state) instead of swapping back to the light LoadingState overlay — that
  swap flashed white in light mode.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import {
    resolveBackend,
    setManualBackend,
    type ResolvedBackend,
  } from '$lib/client/backend-discovery';
  import { setReporterBackend, reportWarning } from '$lib/client/error-reporter';
  import { BRAND } from '$lib/client/brand';
  import { Button } from '$lib/components/ui/button';
  import { RefreshCw, Server, ChevronRight, AlertCircle } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import LoadingState from './LoadingState.svelte';

  // `preview` is dev-only (the /dev/views gallery): force the error card so
  // the state can be inspected without actually breaking the backend.
  let { children, preview = false } = $props<{
    children?: import('svelte').Snippet;
    preview?: boolean;
  }>();

  type State =
    | { kind: 'init' }
    | { kind: 'resolving'; phase: string }
    | { kind: 'ready'; resolved: ResolvedBackend }
    | { kind: 'failed'; error: string };

  let boot: State = $state({ kind: 'init' });
  let isCapacitor = $derived(typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());

  let showManual = $state(false);
  let manualUrl = $state('');
  let urlError = $state<string | null>(null);
  let busy = $state(false);
  let showDetails = $state(false);

  const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  function discover(): Promise<ResolvedBackend> {
    const w = globalThis as { __HERON__?: { embeddedUrl?: string } };
    return resolveBackend({ embeddedUrl: w?.__HERON__?.embeddedUrl });
  }

  // First boot: shows the branded LoadingState overlay while discovering.
  async function initialResolve(): Promise<void> {
    if (!isCapacitor) {
      boot = {
        kind: 'ready',
        resolved: { url: location.origin, source: 'embedded', resolvedAt: Date.now() },
      };
      setReporterBackend(location.origin);
      return;
    }
    boot = { kind: 'resolving', phase: `Looking for your ${BRAND.displayName} server…` };
    try {
      const resolved = await discover();
      boot = { kind: 'ready', resolved };
      setReporterBackend(resolved.url);
    } catch (e) {
      boot = { kind: 'failed', error: msg(e) };
      void reportWarning(e, { source: 'backend-discovery' });
    }
  }

  // Run an async resolve while keeping the dark error card on screen (busy
  // spinner) -- never swap to the light overlay. Always shows a >=500ms beat
  // so the tap registers as "I'm trying" rather than a white flash.
  async function withBusy(run: () => Promise<ResolvedBackend>): Promise<void> {
    if (busy) return;
    busy = true;
    const startedAt = Date.now();
    try {
      const resolved = await run();
      boot = { kind: 'ready', resolved };
      setReporterBackend(resolved.url);
    } catch (e) {
      boot = { kind: 'failed', error: msg(e) };
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed));
      busy = false;
    }
  }

  function retry(): void {
    void withBusy(discover);
  }

  function validateUrl(raw: string): string | null {
    const v = raw.trim();
    if (!v) return 'Enter a server address.';
    const normalized = /^https?:\/\//i.test(v) ? v : `http://${v}`;
    try {
      const u = new URL(normalized);
      if (!u.hostname) return 'That address is missing a host name.';
      return null;
    } catch {
      return "That doesn't look like a valid address.";
    }
  }

  function connectManual(): void {
    if (busy) return;
    const err = validateUrl(manualUrl);
    urlError = err;
    if (err) return;
    const raw = manualUrl.trim();
    const normalized = (/^https?:\/\//i.test(raw) ? raw : `http://${raw}`).replace(/\/$/, '');
    void withBusy(async () => {
      await setManualBackend(normalized);
      return discover();
    });
  }

  onMount(() => {
    if (preview) {
      boot = { kind: 'failed', error: 'Preview — simulated connection failure.' };
      return;
    }
    void initialResolve();
  });
</script>

{#if !preview && (!isCapacitor || boot.kind === 'ready')}
  {@render children?.()}
{:else if !preview && (boot.kind === 'init' || boot.kind === 'resolving')}
  <LoadingState
    variant="overlay"
    message={boot.kind === 'resolving' ? boot.phase : 'Starting up…'}
    sub="This only takes a moment on first launch."
  />
{:else}
  {@render errorCard()}
{/if}

{#snippet errorCard()}
  <!-- Can't connect. Brand-bloom backdrop + brand mark + human copy +
       actionable Try-again / manual-address, matching BackendUnreachableOverlay. -->
  <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="backend-boot-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-6"
  >
    <div
      aria-hidden="true"
      class="absolute inset-0"
      style="background:
        radial-gradient(circle at 50% 38%, rgba(122, 140, 109, 0.22) 0%, rgba(74, 91, 109, 0.11) 34%, rgba(200, 155, 74, 0.05) 58%, transparent 80%),
        #0e1014;"
    ></div>

    <div
      class="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/80 p-8 text-center shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] backdrop-blur-lg"
    >
      <div
        class="size-16 drop-shadow-[0_0_24px_rgba(122,140,109,0.4)] drop-shadow-[0_6px_16px_rgba(122,140,109,0.2)]"
      >
        <svg viewBox="0 0 1024 1024" aria-hidden="true" class="block size-full">
          <!-- AUTO-GENERATED:brand-mark gradient-id="bbg-grad" -->
          <defs>
            <linearGradient id="bbg-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4a5b6d" />
              <stop offset="55%" stop-color="#7a8c6d" />
              <stop offset="100%" stop-color="#c89b4a" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" rx="232" fill="url(#bbg-grad)" />
          <rect x="0" y="0" width="1024" height="512" rx="232" fill="#ffffff" opacity="0.06" />
          <g
            transform="translate(192,192) scale(26.667)"
            fill="none"
            stroke="#ffffff"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 7h.01" />
            <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
            <path d="m20 7 2 .5-2 .5" />
            <path d="M10 18v3" />
            <path d="M14 17.75V21" />
            <path d="M7 18a6 6 0 0 0 3.84-10.61" />
          </g>
          <!-- /AUTO-GENERATED:brand-mark -->
        </svg>
      </div>

      <div class="flex flex-col gap-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
          Can't connect
        </div>
        <h2 id="backend-boot-title" class="text-lg font-semibold tracking-tight text-zinc-50">
          Can't reach your {BRAND.displayName} server
        </h2>
      </div>

      <p class="text-sm leading-relaxed text-zinc-300/85">
        {BRAND.displayName} keeps your data on your own computer. To use it here, open the
        {BRAND.displayName} app on that computer and make sure this device is on the same Wi-Fi — or enter
        its address below.
      </p>

      <Button onclick={retry} disabled={busy} class="mt-1 w-full gap-2" size="lg">
        {#if busy}
          <span
            class="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          ></span>
          Reconnecting…
        {:else}
          <RefreshCw class="size-4" />
          Try again
        {/if}
      </Button>

      {#if !showManual}
        <button
          type="button"
          class="text-xs font-medium text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
          onclick={() => (showManual = true)}
        >
          Enter a server address
        </button>
      {:else}
        <div class="flex w-full flex-col gap-2 text-left" transition:slide={{ duration: 200 }}>
          <label
            class="flex items-center gap-2 rounded-lg border bg-black/30 px-3 transition-colors {urlError
              ? 'border-red-500/60'
              : 'border-white/10 focus-within:border-white/25'}"
          >
            <Server class="size-4 shrink-0 text-zinc-400" />
            <input
              type="url"
              inputmode="url"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              bind:value={manualUrl}
              oninput={() => (urlError = null)}
              onkeydown={(e) => e.key === 'Enter' && connectManual()}
              placeholder="192.168.1.20:5173"
              aria-invalid={urlError ? 'true' : undefined}
              aria-label="Server address"
              disabled={busy}
              class="w-full bg-transparent py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
            />
          </label>
          {#if urlError}
            <p
              class="flex items-center gap-1.5 text-xs text-red-300"
              transition:slide={{ duration: 150 }}
            >
              <AlertCircle class="size-3.5 shrink-0" />
              {urlError}
            </p>
          {/if}
          <Button onclick={connectManual} disabled={busy || !manualUrl.trim()} class="w-full gap-2">
            {#if busy}
              <span
                class="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
              ></span>
              Connecting…
            {:else}
              Connect
            {/if}
          </Button>
        </div>
      {/if}

      <button
        type="button"
        class="flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        onclick={() => (showDetails = !showDetails)}
        aria-expanded={showDetails}
      >
        <ChevronRight
          class="size-3 transition-transform duration-200 {showDetails ? 'rotate-90' : ''}"
        />
        Connection details
      </button>
      {#if showDetails}
        <div
          class="w-full break-words rounded-lg bg-black/30 p-3 text-left font-mono text-[11px] leading-relaxed text-zinc-400"
          transition:slide={{ duration: 200 }}
        >
          <div class="mb-1 text-zinc-500">Checked, in order:</div>
          <div>· this device (built-in)</div>
          <div>· your computer on the same Wi-Fi</div>
          <div>· Tailscale</div>
          <div>· a saved remote address</div>
          {#if boot.kind === 'failed' && boot.error}
            <div class="mt-2 text-red-300/90">{boot.error}</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}
