<!--
  Dev view gallery — preview every full-screen / transient app state in one
  place, so a designer/dev (or the maintainer in the simulator) can eyeball
  each without engineering a real failure.

  DEV-ONLY: gated on `$app/environment` dev. In a production build this page
  renders nothing useful. In the iOS simulator it's reachable in `pnpm dev:ios
  --live` (the WebView loads the vite dev server, so dev === true and the
  http origin skips the native auth gate).

  Maintenance: add a state by appending one entry to `OVERLAYS` (full-screen
  components rendered via a `preview` prop) or `ACTIONS` (toasts / navigations
  / store pokes). No other wiring needed.
-->
<script lang="ts">
  import { dev } from '$app/environment';
  import { devtoolsEnabled } from '$lib/client/devtools.svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { reportClientError } from '$lib/notifications.svelte';
  import { onlineStore } from '$lib/client/online-status.svelte';
  import BackendBootGuard from '$lib/components/BackendBootGuard.svelte';
  import BackendUnreachableOverlay from '$lib/components/BackendUnreachableOverlay.svelte';
  import LoadingState from '$lib/components/LoadingState.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import ThrowNow from './ThrowNow.svelte';

  // Which full-screen overlay (if any) is currently being previewed.
  type OverlayId =
    | 'connect-error'
    | 'backend-unreachable'
    | 'loading'
    | 'loading-block'
    | 'loading-skeleton'
    | 'error-boundary'
    | 'boundary'
    | null;
  let active = $state<OverlayId>(null);

  const OVERLAYS: { id: Exclude<OverlayId, null>; label: string; hint: string }[] = [
    {
      id: 'connect-error',
      label: "Can't reach server",
      hint: 'BackendBootGuard — first-boot discovery failed',
    },
    {
      id: 'backend-unreachable',
      label: 'Backend unreachable',
      hint: 'BackendUnreachableOverlay — lost mid-session',
    },
    { id: 'loading', label: 'Loading (overlay)', hint: 'LoadingState variant="overlay"' },
    { id: 'loading-block', label: 'Loading (block)', hint: 'LoadingState variant="block"' },
    {
      id: 'loading-skeleton',
      label: 'Loading (skeleton)',
      hint: 'LoadingState variant="skeleton"',
    },
    {
      id: 'error-boundary',
      label: 'Component error boundary',
      hint: 'ErrorBoundary — wraps AgentChat/dialogs',
    },
    {
      id: 'boundary',
      label: 'Page crash boundary',
      hint: 'svelte:boundary — a component threw on render',
    },
  ];

  const ACTIONS: { label: string; hint: string; run: () => void }[] = [
    {
      label: 'Toast: error (real)',
      hint: 'reportClientError → toast + Issues store + Details action',
      run: () =>
        reportClientError('dev-gallery', 'Something went wrong', new Error('Preview error toast')),
    },
    {
      label: 'Toast: warning',
      hint: 'toast.warning',
      run: () => toast.warning('Heads up', { description: 'A warning toast preview.' }),
    },
    {
      label: 'Toast: success',
      hint: 'toast.success',
      run: () => toast.success('Done', { description: 'A success toast preview.' }),
    },
    {
      label: 'Toast: info',
      hint: 'toast.info',
      run: () => toast.info('FYI', { description: 'An info toast preview.' }),
    },
    {
      label: 'Offline pill',
      hint: 'OfflineIndicator — force offline',
      run: () => onlineStore.__devForce(false),
    },
    {
      label: 'Back online',
      hint: 'OfflineIndicator — clear offline',
      run: () => onlineStore.__devForce(true),
    },
    {
      label: 'Page error (404)',
      hint: '+error.svelte via a missing route',
      run: () => void goto('/dev/views/__does-not-exist'),
    },
  ];
</script>

{#if !(dev || devtoolsEnabled())}
  <div class="flex h-svh items-center justify-center p-8 text-center text-muted-foreground">
    The dev view gallery is available in development (<code>pnpm dev</code>), or in a built app once
    developer tools are enabled in Settings &rarr; About.
  </div>
{:else}
  <!-- Solid full-height bg so navigating in never flashes the bare canvas. -->
  <div class="min-h-svh bg-background">
    <div class="mx-auto max-w-2xl p-6">
      <h1 class="text-xl font-semibold tracking-tight">Dev · View gallery</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Preview each app state in isolation. Overlays show full-screen with a Close button; actions
        fire transient UI (toasts, pills) or navigate.
      </p>

      <h2 class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Full-screen states
      </h2>
      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each OVERLAYS as o}
          <button
            type="button"
            onclick={() => (active = o.id)}
            class="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
          >
            <div class="text-sm font-medium">{o.label}</div>
            <div class="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>
          </button>
        {/each}
      </div>

      <h2 class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Toasts, pills & pages
      </h2>
      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each ACTIONS as a}
          <button
            type="button"
            onclick={a.run}
            class="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
          >
            <div class="text-sm font-medium">{a.label}</div>
            <div class="mt-0.5 text-xs text-muted-foreground">{a.hint}</div>
          </button>
        {/each}
      </div>

      <h2 class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Native / pre-hydration states
      </h2>
      <p class="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        The native <strong>BootFailureView</strong> (WebView failed to load) and the
        <strong>#boot-fallback</strong> splash render outside this WebView's control: the boot-fallback
        shows on every cold launch before hydration, and the native fallback appears automatically if
        the WebView doesn't paint within ~12s (it can't be summoned from JS). The on-device diagnostics
        overlay is reachable any time by tapping the top-left corner 5× quickly.
      </p>
    </div>
  </div>

  <!-- Active overlay preview + a Close affordance above everything. -->
  {#if active}
    <button
      type="button"
      onclick={() => (active = null)}
      class="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-[2147483647] rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur"
    >
      Close preview
    </button>
  {/if}
  {#if active === 'connect-error'}
    <BackendBootGuard preview />
  {:else if active === 'backend-unreachable'}
    <BackendUnreachableOverlay preview />
  {:else if active === 'loading'}
    <LoadingState
      variant="overlay"
      message="Looking for your Heron server…"
      sub="This only takes a moment on first launch."
    />
  {:else if active === 'loading-block' || active === 'loading-skeleton'}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-background p-8">
      <div class="w-full max-w-sm">
        {#if active === 'loading-block'}
          <LoadingState variant="block" message="Loading your pipeline…" />
        {:else}
          <LoadingState variant="skeleton" rows={5} />
        {/if}
      </div>
    </div>
  {:else if active === 'error-boundary'}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-background p-6">
      <div class="w-full max-w-xl">
        <ErrorBoundary title="Agent chat crashed">
          <ThrowNow />
        </ErrorBoundary>
      </div>
    </div>
  {:else if active === 'boundary'}
    <ThrowNow />
  {/if}
{/if}
