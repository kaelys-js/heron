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
  import { validateServerUrl, normalizeServerUrl } from '$lib/client/server-url';
  import { BRAND } from '$lib/client/brand';
  import { Button } from '$lib/components/ui/button';
  import { RefreshCw, Server, ChevronRight, AlertCircle, Check } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import LoadingState from './LoadingState.svelte';
  import ConnectivityCard from './ConnectivityCard.svelte';

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
  // `touched` gates live validation: no error shows until the user leaves the
  // field once (or hits Connect), then feedback updates live as they type --
  // so we don't nag mid-first-entry.
  let touched = $state(false);
  // Which action (if any) is in flight. A single shared boolean used to drive
  // BOTH buttons' spinners, so triggering one spun the other too -- track the
  // specific action instead so each button only spins for itself.
  let inFlight = $state<'retry' | 'connect' | null>(null);
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

  // Run an async resolve while keeping the dark error card on screen (the
  // active button shows a spinner) -- never swap to the light overlay. Always
  // shows a >=500ms beat so the tap registers as "I'm trying" rather than a
  // white flash. `kind` records which button is busy so only it spins.
  async function withInFlight(
    kind: 'retry' | 'connect',
    run: () => Promise<ResolvedBackend>,
  ): Promise<void> {
    if (inFlight) return;
    inFlight = kind;
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
      inFlight = null;
    }
  }

  function retry(): void {
    void withInFlight('retry', discover);
  }

  // Validation lives in $lib/client/server-url (unit-tested): it rejects garbage
  // like ".com" that a bare `new URL()` (or a naive host.includes('.')) lets
  // through, requiring localhost / a real IP / a well-formed dotted name + port.
  let urlValid = $derived(validateServerUrl(manualUrl) === null);

  // Error to display live / on blur. An empty field shows nothing (it's
  // optional until they commit); the submit guard handles the empty case.
  function fieldError(): string | null {
    return manualUrl.trim() ? validateServerUrl(manualUrl) : null;
  }

  function connectManual(): void {
    if (inFlight) return;
    touched = true;
    const err = validateServerUrl(manualUrl);
    urlError = err;
    if (err) return;
    // Normalize to an origin only (scheme://host[:port]) -- a backend base URL
    // should never carry a path/query/hash.
    const normalized = normalizeServerUrl(manualUrl);
    void withInFlight('connect', async () => {
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
  <!-- Can't connect. ConnectivityCard owns the bloom backdrop, glass card,
       and reed-green brand mark; this snippet supplies the copy + the
       actionable Try-again / manual-address controls + the details
       disclosure. -->
  <ConnectivityCard
    role="alertdialog"
    ariaLabelledby="backend-boot-title"
    headingId="backend-boot-title"
    {heading}
    {body}
    {actions}
    {details}
  />
{/snippet}

{#snippet heading()}
  Can't reach your {BRAND.displayName} server
{/snippet}

{#snippet body()}
  {BRAND.displayName} keeps your data on your own computer. Open it there and make sure this device is
  on the same Wi-Fi — or enter its address below.
{/snippet}

{#snippet actions()}
  <Button
    onclick={retry}
    disabled={inFlight !== null}
    aria-busy={inFlight === 'retry'}
    data-testid="boot-retry"
    class="mt-1 w-full gap-2"
    size="lg"
  >
    {#if inFlight === 'retry'}
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
      class="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      onclick={() => (showManual = true)}
    >
      Enter a server address
    </button>
  {:else}
    <div class="flex w-full flex-col gap-2 text-left" transition:slide={{ duration: 200 }}>
      <label
        class="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 transition-colors {urlError
          ? 'border-red-500/60'
          : touched && urlValid && manualUrl.trim()
            ? 'border-emerald-500/50'
            : 'border-border/40 focus-within:border-border'}"
      >
        {#if touched && urlValid && manualUrl.trim()}
          <Check class="size-4 shrink-0 text-emerald-400" />
        {:else}
          <Server class="size-4 shrink-0 text-muted-foreground" />
        {/if}
        <input
          type="url"
          inputmode="url"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          bind:value={manualUrl}
          oninput={() => {
            if (touched) urlError = fieldError();
          }}
          onblur={() => {
            touched = true;
            urlError = fieldError();
          }}
          onkeydown={(e) => e.key === 'Enter' && connectManual()}
          placeholder="192.168.1.20:5173"
          aria-invalid={urlError ? 'true' : undefined}
          aria-label="Server address"
          disabled={inFlight !== null}
          class="w-full bg-transparent py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
        />
      </label>
      {#if urlError}
        <p
          class="flex items-center gap-1.5 text-xs text-red-300"
          role="alert"
          transition:slide={{ duration: 150 }}
        >
          <AlertCircle class="size-3.5 shrink-0" />
          {urlError}
        </p>
      {/if}
      <Button
        onclick={connectManual}
        disabled={inFlight !== null || !urlValid}
        aria-busy={inFlight === 'connect'}
        data-testid="boot-connect"
        class="w-full gap-2"
        size="lg"
      >
        {#if inFlight === 'connect'}
          <span
            class="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          ></span>
          Connecting…
        {:else}
          <Server class="size-4" />
          Connect
        {/if}
      </Button>
    </div>
  {/if}
{/snippet}

{#snippet details()}
  <button
    type="button"
    class="flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
    onclick={() => (showDetails = !showDetails)}
    aria-expanded={showDetails}
  >
    <ChevronRight
      aria-hidden="true"
      class="size-3 transition-transform duration-200 {showDetails ? 'rotate-90' : ''}"
    />
    Connection details
  </button>
  {#if showDetails}
    <div
      class="w-full break-words rounded-lg bg-muted/40 p-3 text-left font-mono text-[11px] leading-relaxed text-muted-foreground"
      transition:slide={{ duration: 200 }}
    >
      <div class="mb-1 text-muted-foreground/70">Checked, in order:</div>
      <div>· this device (built-in)</div>
      <div>· your computer on the same Wi-Fi</div>
      <div>· Tailscale</div>
      <div>· a saved remote address</div>
      {#if boot.kind === 'failed' && boot.error}
        <div class="mt-2 text-red-300/90">{boot.error}</div>
      {/if}
    </div>
  {/if}
{/snippet}
