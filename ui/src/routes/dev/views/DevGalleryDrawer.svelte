<!--
  Dev view gallery, presented as a bottom DRAWER (bits-ui Sheet) so it slides
  in/out with animation, closes on Esc / backdrop click / handle-drag, and
  renders in a portal ABOVE all app chrome (incl. the topbar theme dropdown) --
  the same primitive the theme menu uses. Opened by the floating flask launcher
  in the root layout, or by navigating to /dev/views.

  DEV-ONLY: gated on `$app/environment` dev OR the developer-tools opt-in.
  Add a state by appending to OVERLAYS (full-screen components), ROUTES
  (page navigations) or ACTIONS (toasts / pills).
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
  import BloomBackground from '$lib/components/BloomBackground.svelte';
  import { dragToDismiss } from '$lib/actions/drag-to-dismiss';
  import ThrowNow from './ThrowNow.svelte';
  import {
    Unplug,
    WifiOff,
    Wifi,
    Loader,
    Hourglass,
    Rows3,
    Bug,
    ShieldAlert,
    LogIn,
    Ticket,
    FileSearch,
    ServerCrash,
    Lock,
    CircleAlert,
    TriangleAlert,
    CircleCheck,
    Info,
    ChevronRight,
    Stethoscope,
  } from '@lucide/svelte';

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

  type Tile = { label: string; hint: string; icon: any; run: () => void };

  const OVERLAYS: Tile[] = [
    {
      label: "Can't reach server",
      hint: 'BackendBootGuard — first-boot discovery failed',
      icon: Unplug,
      run: () => showOverlay('connect-error'),
    },
    {
      label: 'Backend unreachable',
      hint: 'BackendUnreachableOverlay — lost mid-session',
      icon: WifiOff,
      run: () => showOverlay('backend-unreachable'),
    },
    {
      label: 'Loading · overlay',
      hint: 'LoadingState variant="overlay"',
      icon: Loader,
      run: () => showOverlay('loading'),
    },
    {
      label: 'Loading · block',
      hint: 'LoadingState variant="block"',
      icon: Hourglass,
      run: () => showOverlay('loading-block'),
    },
    {
      label: 'Loading · skeleton',
      hint: 'LoadingState variant="skeleton"',
      icon: Rows3,
      run: () => showOverlay('loading-skeleton'),
    },
    {
      label: 'Component error boundary',
      hint: 'ErrorBoundary — wraps AgentChat/dialogs',
      icon: Bug,
      run: () => showOverlay('error-boundary'),
    },
    {
      label: 'Page crash boundary',
      hint: 'svelte:boundary — a component threw on render',
      icon: ShieldAlert,
      run: () => showOverlay('boundary'),
    },
  ];

  const ROUTES: Tile[] = [
    {
      label: 'Login',
      hint: '/login — passkey-first sign-in',
      icon: LogIn,
      run: () => nav('/login'),
    },
    {
      label: 'Set up with invite code',
      hint: '/signup — invite-code onboarding',
      icon: Ticket,
      run: () => nav('/signup'),
    },
    {
      label: 'Page error · 404',
      hint: '+error.svelte — not found',
      icon: FileSearch,
      run: () => nav('/dev/views/__does-not-exist'),
    },
    {
      label: 'Page error · 500',
      hint: '+error.svelte — server error preset',
      icon: ServerCrash,
      run: () => nav('/dev/views/preview-error/500'),
    },
    {
      label: 'Page error · 403',
      hint: '+error.svelte — forbidden preset',
      icon: Lock,
      run: () => nav('/dev/views/preview-error/403'),
    },
  ];

  const ACTIONS: Tile[] = [
    {
      label: 'Toast · error (real)',
      hint: 'reportClientError → toast + Issues store',
      icon: CircleAlert,
      run: () =>
        reportClientError('dev-gallery', 'Something went wrong', new Error('Preview error toast')),
    },
    {
      label: 'Toast · warning',
      hint: 'toast.warning',
      icon: TriangleAlert,
      run: () => toast.warning('Heads up', { description: 'A warning toast preview.' }),
    },
    {
      label: 'Toast · success',
      hint: 'toast.success',
      icon: CircleCheck,
      run: () => toast.success('Done', { description: 'A success toast preview.' }),
    },
    {
      label: 'Toast · info',
      hint: 'toast.info',
      icon: Info,
      run: () => toast.info('FYI', { description: 'An info toast preview.' }),
    },
    {
      label: 'Offline pill',
      hint: 'OfflineIndicator — force offline',
      icon: WifiOff,
      run: () => onlineStore.__devForce(false),
    },
    {
      label: 'Back online',
      hint: 'OfflineIndicator — clear offline',
      icon: Wifi,
      run: () => onlineStore.__devForce(true),
    },
  ];

  // Open a full-screen preview: close the drawer first so the preview stands
  // alone (its own Close button restores normal app state).
  function showOverlay(id: Exclude<OverlayId, null>): void {
    active = id;
    open = false;
  }

  // Navigate to a real page / error route: close the drawer (without firing the
  // route's onClose -> goto('/'), which would double-navigate), then go.
  function nav(href: string): void {
    open = false;
    void goto(href);
  }

  // The on-device diagnostics panel (app.html, normally opened by 5 corner-taps)
  // exposes a global show() hook. Close the drawer first so it's unobstructed.
  function showDiagnostics(): void {
    open = false;
    (globalThis as { __heronDiag?: { show?: () => void } }).__heronDiag?.show?.();
  }

  function handleOpenChange(next: boolean): void {
    if (next === open) return; // ignore no-op (e.g. drag-dismiss already closed it)
    open = next;
    if (!next) {
      onClose?.();
    }
  }

  // The drawer (Sheet) closes on Esc on its own, but a full-screen preview
  // renders OUTSIDE the Sheet (drawer already closed), so it needs its own
  // Esc handler to dismiss back to the app.
  function handleKeydown(event: KeyboardEvent): void {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      active = null;
    }
  }

  // bits-ui Sheet.Content is a component, so `use:` can't target its DOM node;
  // grab it via bind:ref and drive drag-to-dismiss from an effect. The handle
  // pill inside carries `data-drag-handle`.
  let sheetContent = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!sheetContent) return;
    const instance = dragToDismiss(sheetContent, { onDismiss: () => handleOpenChange(false) });
    return () => instance?.destroy?.();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet tile(item: Tile)}
  {@const Icon = item.icon}
  <button
    type="button"
    onclick={item.run}
    class="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-border hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
  >
    <span
      class="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground"
    >
      <Icon class="size-4" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-sm font-medium">{item.label}</span>
      <span class="block text-xs leading-snug text-muted-foreground">{item.hint}</span>
    </span>
    <ChevronRight
      class="size-4 flex-shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
    />
  </button>
{/snippet}

{#if dev || devtoolsEnabled()}
  <Sheet.Root bind:open onOpenChange={handleOpenChange}>
    <Sheet.Content
      bind:ref={sheetContent}
      side="bottom"
      class="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
      showCloseButton={false}
    >
      <!-- Drag-handle pill. `data-drag-handle` wires drag-to-dismiss (dragToDismiss
           action); matches the theme sheet's affordance instead of a corner X. -->
      <div
        data-drag-handle
        aria-hidden="true"
        class="mx-auto mt-2.5 mb-1 h-1.5 w-10 flex-shrink-0 touch-none rounded-full bg-muted-foreground/40"
      ></div>

      <Sheet.Header class="border-b border-border px-5 pb-4 pt-1">
        <Sheet.Title class="font-serif text-lg tracking-tight">Dev · View gallery</Sheet.Title>
        <Sheet.Description>
          Preview each app state in isolation. Full-screen states show with their own Close; routes
          navigate; actions fire transient UI.
        </Sheet.Description>
      </Sheet.Header>

      <div class="flex-1 space-y-6 overflow-y-auto p-5">
        <section>
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Full-screen states
          </h2>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {#each OVERLAYS as o (o.label)}
              {@render tile(o)}
            {/each}
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pages &amp; routes
          </h2>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {#each ROUTES as r (r.label)}
              {@render tile(r)}
            {/each}
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Toasts &amp; pills
          </h2>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {#each ACTIONS as a (a.label)}
              {@render tile(a)}
            {/each}
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Native / pre-hydration states
          </h2>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {@render tile({
              label: 'Diagnostics overlay',
              hint: 'heron diagnostics — app.html corner-tap panel',
              icon: Stethoscope,
              run: showDiagnostics,
            })}
          </div>
          <p
            class="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
          >
            The native <strong>BootFailureView</strong> and the <strong>#boot-fallback</strong> splash
            render outside this WebView's control and can't be summoned from JS.
          </p>
        </section>
      </div>
    </Sheet.Content>
  </Sheet.Root>

  <!-- Active full-screen preview (renders above everything; its own Close
       restores the app). Sits OUTSIDE the Sheet so it's truly full-screen. -->
  {#if active}
    <button
      type="button"
      onclick={() => (active = null)}
      class="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-[2147483647] rounded-full border border-primary/40 bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/60 hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      Close preview
    </button>
  {/if}
  {#if active === 'connect-error'}
    <BackendBootGuard preview />
  {:else if active === 'backend-unreachable'}
    <BackendUnreachableOverlay preview onDismiss={() => (active = null)} />
  {:else if active === 'loading'}
    <LoadingState
      variant="overlay"
      message="Looking for your Heron server…"
      sub="This only takes a moment on first launch."
    />
  {:else if active === 'loading-block' || active === 'loading-skeleton'}
    <div
      class="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-background p-8"
    >
      <BloomBackground />
      <div class="relative z-10 w-full max-w-sm">
        {#if active === 'loading-block'}
          <LoadingState variant="block" message="Loading your pipeline…" />
        {:else}
          <LoadingState variant="skeleton" rows={5} />
        {/if}
      </div>
    </div>
  {:else if active === 'error-boundary'}
    <div
      class="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-background p-6"
    >
      <BloomBackground />
      <div class="relative z-10 w-full max-w-xl">
        <ErrorBoundary title="Agent chat crashed">
          <ThrowNow />
        </ErrorBoundary>
      </div>
    </div>
  {:else if active === 'boundary'}
    <ThrowNow />
  {/if}
{/if}
