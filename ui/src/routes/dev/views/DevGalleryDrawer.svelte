<!--
  Dev view gallery, presented as a left-side DRAWER (bits-ui Sheet) so it
  slides in/out with animation, closes on Esc / backdrop click, and renders in
  a portal ABOVE all app chrome (incl. the topbar theme dropdown) -- the same
  primitive the theme menu uses. Opened by the floating flask launcher in the
  root layout, or by navigating to /dev/views.

  DEV-ONLY: gated on `$app/environment` dev OR the developer-tools opt-in.
  Add a state by appending to OVERLAYS (full-screen components) or ACTIONS
  (toasts / pokes / navigations).
-->
<script lang="ts">
  import { dev } from '$app/environment';
  import { devtoolsEnabled } from '$lib/client/devtools.svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { reportClientError } from '$lib/notifications.svelte';
  import { onlineStore } from '$lib/client/online-status.svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import BackendBootGuard from '$lib/components/BackendBootGuard.svelte';
  import BackendUnreachableOverlay from '$lib/components/BackendUnreachableOverlay.svelte';
  import LoadingState from '$lib/components/LoadingState.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import ThrowNow from './ThrowNow.svelte';

  // `open` is two-way bound by the caller (the flask sets it true; the route
  // mounts it true). `onClose` lets the route navigate away when the drawer
  // is dismissed (the flask just leaves open=false in place).
  let { open = $bindable(false), onClose }: { open?: boolean; onClose?: () => void } = $props();

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

  // Open a full-screen preview: close the drawer first so the preview stands
  // alone (its own Close button restores normal app state).
  function showOverlay(id: Exclude<OverlayId, null>): void {
    active = id;
    open = false;
  }

  function handleOpenChange(next: boolean): void {
    open = next;
    if (!next) {
      onClose?.();
    }
  }
</script>

{#if dev || devtoolsEnabled()}
  <Sheet.Root bind:open onOpenChange={handleOpenChange}>
    <Sheet.Content
      side="bottom"
      class="flex max-h-[85vh] flex-col gap-0 overflow-y-auto rounded-t-2xl p-0"
    >
      <Sheet.Header class="border-b border-border p-5">
        <Sheet.Title>Dev · View gallery</Sheet.Title>
        <Sheet.Description>
          Preview each app state in isolation. Overlays show full-screen with their own Close;
          actions fire transient UI or navigate.
        </Sheet.Description>
      </Sheet.Header>

      <div class="flex-1 overflow-y-auto p-5">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Full-screen states
        </h2>
        <div class="mt-2 grid grid-cols-1 gap-2">
          {#each OVERLAYS as o}
            <button
              type="button"
              onclick={() => showOverlay(o.id)}
              class="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            >
              <div class="text-sm font-medium">{o.label}</div>
              <div class="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>
            </button>
          {/each}
        </div>

        <h2 class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Toasts, pills &amp; pages
        </h2>
        <div class="mt-2 grid grid-cols-1 gap-2">
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
        <p
          class="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          The native <strong>BootFailureView</strong> and the <strong>#boot-fallback</strong> splash render
          outside this WebView's control and can't be summoned from JS.
        </p>
      </div>
    </Sheet.Content>
  </Sheet.Root>

  <!-- Active full-screen preview (renders above everything; its own Close
       restores the app). Sits OUTSIDE the Sheet so it's truly full-screen. -->
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
