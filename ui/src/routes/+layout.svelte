<script lang="ts">
  import '../app.css';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import AgentChat from '$lib/components/AgentChat.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import AddJobDialog from '$lib/components/AddJobDialog.svelte';
  import PostRejectionSheet from '$lib/components/PostRejectionSheet.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import { Toaster } from '$lib/components/ui/sonner';
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import { reportClientError } from '$lib/notifications.svelte';
  import { BRAND_EVENTS } from '$lib/client/brand';
  import { onNavigate } from '$app/navigation';
  import { APP_NAME, APP_DESCRIPTION } from '$lib/config/branding';
  import { theme } from '$lib/theme.svelte';
  import { onMount, setContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { installErrorReporter, setReporterBackend } from '$lib/client/error-reporter';
  import { onlineStore } from '$lib/client/online-status.svelte';
  import { authClient } from '$lib/client/auth-client';
  import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';

  // Routes that don't require an authenticated session. Reaching any of
  // these never triggers a redirect to /login.
  const PUBLIC_ROUTES = ['/login', '/signup', '/help'];

  function isPublicRoute(path: string): boolean {
    return (
      PUBLIC_ROUTES.includes(path) ||
      PUBLIC_ROUTES.some((r) => path.startsWith(r + '/')) ||
      path.startsWith('/onboarding')
    );
  }

  onMount(() => {
    // Hydrate the theme store so OS-preference changes propagate at runtime.
    // The inline app.html script already applied the initial class — this
    // just lights up the reactive store.
    theme.init();

    // Install global error handlers (window.onerror + onunhandledrejection)
    // and wire the reporter at the current origin. backend-discovery (the
    // Capacitor resolver) updates this later via setReporterBackend when
    // running native — but in plain web mode, location.origin is correct.
    if (typeof window !== 'undefined') {
      installErrorReporter(window.location.origin);
      // Initialize the cross-platform online-status store. Periodic /api/health
      // probe + navigator.onLine listeners + native hints (iOS/Electron) all
      // funnel through one boolean — OfflineIndicator + api.ts subscribe.
      onlineStore.init(window.location.origin);
    }

    // Kick off backend discovery early so api-base.ts's cache is primed
    // before any /api/* call. On web (any http(s) origin) this resolves
    // instantly to ''. On Capacitor it runs the dev → mDNS → Tailscale →
    // production probe ladder. We don't await — first /api/* call will
    // wait on the same promise via api-base.ts's `resolving` deduplication.
    void import('$lib/client/api-base').then(({ getApiBase }) =>
      getApiBase()
        .then((base) => {
          if (base) setReporterBackend(base);
        })
        .catch(() => {
          /* OfflineIndicator surfaces the failure */
        }),
    );

    // Splash dismiss + boot-fallback removal — coordinate so the user sees
    // a clean crossfade native-splash → boot-fallback → SvelteKit shell
    // instead of three abrupt cuts. Two rAFs ensures the layout has
    // painted at least one frame before we tell either layer to fade.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Fade out the inline boot-fallback first (transition: opacity 250ms
        // is set in app.html's inline style). data-hide="1" triggers the
        // CSS rule that drops opacity to 0; remove the node 300ms later.
        if (typeof document !== 'undefined') {
          const bootFallback = document.getElementById('boot-fallback');
          if (bootFallback) {
            bootFallback.setAttribute('data-hide', '1');
            setTimeout(() => bootFallback.remove(), 300);
          }
        }
        // Dismiss the Capacitor native splash in the same frame, with a
        // matched fadeOutDuration so the user perceives a single crossfade.
        // 400ms gives the SvelteKit shell time to paint at least its
        // sidebar + topbar chrome.
        import('@capacitor/splash-screen')
          .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 400 }))
          .catch(() => {
            /* not running native; nothing to dismiss */
          });
      }),
    );

    // Client-side auth gate. In adapter-node builds hooks.server.ts
    // bounces unauthenticated users to /login before the page ever
    // hydrates — but in adapter-static (Capacitor) hooks.server.ts
    // doesn't run, so we have to gate here.
    //
    // Mechanism: a localStorage flag set by /login on successful sign-in
    // (`career-ops:authed = "1"`) and cleared on sign-out. The actual
    // network probe (authClient.getSession()) is unreliable in Capacitor
    // mode because the backend isn't resolved at first-paint and the
    // fetch can hang silently — racing against a timeout works for
    // showing the redirect, but if the page-level `+page.svelte` calls
    // queueMicrotask(goto('/inbox')) faster than the timeout, the gate's
    // redirect can be overridden. The localStorage check is synchronous
    // so it wins the race. PUBLIC_ROUTES + onboarding remain reachable.
    if (
      typeof window !== 'undefined' &&
      !isPublicRoute(window.location.pathname) &&
      !window.location.protocol.startsWith('http') &&
      localStorage.getItem('career-ops:authed') !== '1'
    ) {
      const redirectTo = '/login?redirectTo=' + encodeURIComponent(window.location.pathname);
      void goto(redirectTo, { replaceState: true });
    }
  });

  let { children, data } = $props();

  // Expose the active profile id via a reactive Svelte context so any
  // descendant (JobCard, JobList, etc.) can render a profile badge when a
  // job from a different profile appears (cross-profile `?profile=all`
  // views). setContext only fires once at mount; the wrapper object is
  // mutated so consumers calling getContext('activeProfile').id stay reactive
  // across profile switches without manual prop drilling.
  // svelte-ignore state_referenced_locally — initial seed only; $effect keeps it live
  const activeProfileCtx = $state<{ id: string | undefined }>({ id: data?.activeProfile?.id });
  $effect(() => {
    activeProfileCtx.id = data?.activeProfile?.id;
  });
  setContext('activeProfile', activeProfileCtx);

  function handleBoundaryError(err: unknown, _reset: () => void) {
    reportClientError('boundary', 'Component crashed', err);
  }

  function handleAgentError(err: unknown, _reset: () => void) {
    reportClientError('agent-chat', 'Agent chat crashed', err);
  }

  /**
   * View Transitions — fade routes when navigating. Progressively enhanced:
   * Chromium ships `document.startViewTransition`; Safari/Firefox skip and we
   * fall through to SvelteKit's default instant swap. The CSS animations live
   * in app.css under `::view-transition-{old,new}(root)` and respect
   * `prefers-reduced-motion`.
   *
   * Defensive: rapid taps can trigger nav-then-nav before the first
   * transition finishes. Without `skipTransition()`, the browser fires
   * an AbortError ("Old view transition aborted by new view transition")
   * that surfaces as an unhandledrejection → red toast. Skip the in-flight
   * one explicitly so the new transition starts clean.
   */
  let inFlightTransition: { skipTransition?: () => void; finished?: Promise<void> } | null = null;
  onNavigate((navigation) => {
    if (typeof document === 'undefined') return;
    const sxt = (document as any).startViewTransition;
    if (typeof sxt !== 'function') return;
    try {
      inFlightTransition?.skipTransition?.();
    } catch {
      /* skipTransition is post-WAICG; older Chromium may lack it */
    }
    return new Promise<void>((resolve) => {
      const t = sxt.call(document, async () => {
        resolve();
        await navigation.complete;
      });
      inFlightTransition = t;
      t.finished?.finally?.(() => {
        if (inFlightTransition === t) inFlightTransition = null;
      });
    });
  });
</script>

<svelte:head>
  <!--
    Brand-derived meta lives here (not in app.html) so changing APP_NAME in
    src/lib/config/branding.ts updates every surface in one shot.
  -->
  <meta name="application-name" content={APP_NAME} />
  <meta name="apple-mobile-web-app-title" content={APP_NAME} />
  <meta name="description" content={APP_DESCRIPTION} />
  <meta property="og:title" content={APP_NAME} />
  <meta property="og:site_name" content={APP_NAME} />
</svelte:head>

<!--
  `h-svh overflow-hidden` locks the wrapper to viewport height so child pages with
  `h-full overflow-y-auto` actually scroll internally. Without this lock, content
  taller than viewport would push the wrapper to grow, breaking sticky topbars.
-->
<Sidebar.Provider class="h-svh overflow-hidden">
  <AppSidebar
    inboxCount={data?.inboxCount ?? 0}
    queueCount={data?.queueCount ?? 0}
    pinnedJobs={data?.pinnedJobs ?? []}
    profilesState={data?.profilesState}
    activeProfile={data?.activeProfile}
  />
  <Sidebar.Inset class="bg-card overflow-hidden">
    <!-- `<main id="main-content">` is the target of app.html's
         skip-to-content link. tabindex=-1 lets keyboard focus land here
         after the skip link is activated. -->
    <main id="main-content" tabindex="-1" class="contents">
      <svelte:boundary onerror={handleBoundaryError}>
        {@render children?.()}
        {#snippet failed(error, reset)}
          <!-- Page-level crash UI. Same visual language as ErrorBoundary
               (the wrapper used by AgentChat / dialogs) so the user sees
               a consistent failure surface across the app. Reload uses
               location.reload() instead of location.assign('') so the
               URL stays intact and the bug is reproducible. -->
          <div class="flex flex-col items-center justify-center min-h-[60vh] p-6 sm:p-8">
            <div
              class="relative w-full max-w-xl flex flex-col gap-4 p-6 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/5 via-card to-card overflow-hidden"
            >
              <div
                class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent"
              ></div>
              <div class="flex items-start gap-3">
                <div
                  class="size-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0"
                >
                  <AlertTriangle class="size-5 text-red-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <h2 class="text-base font-semibold">This page crashed</h2>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    <span
                      class="font-mono text-[11px] text-red-300/80 bg-red-500/10 px-1.5 py-0.5 rounded mr-1"
                    >
                      {error instanceof Error ? error.constructor.name || 'Error' : typeof error}
                    </span>
                    The rest of the app keeps running. This was logged to the activity feed.
                  </p>
                </div>
              </div>
              <pre
                class="text-xs font-mono leading-relaxed bg-muted/40 border border-border/50 rounded-md p-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-foreground/90">{error instanceof
                Error
                  ? error.message || String(error)
                  : typeof error === 'string'
                    ? error
                    : JSON.stringify(error, null, 2)}</pre>
              {#if error instanceof Error && error.stack}
                <details class="group">
                  <summary
                    class="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors select-none flex items-center gap-1.5"
                  >
                    <span
                      class="inline-block transition-transform group-open:rotate-90 text-muted-foreground/60"
                      >▸</span
                    >
                    Stack trace
                  </summary>
                  <pre
                    class="mt-2 p-3 text-[10px] font-mono leading-snug bg-muted/30 border border-border/40 rounded-md max-h-48 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{error.stack}</pre>
                </details>
              {/if}
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onclick={reset} class="h-8 gap-1.5">
                  <RefreshCw class="size-3.5" /> Try again
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => location.reload()}
                  class="h-8 gap-1.5"
                >
                  <RefreshCw class="size-3.5" /> Reload page
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5"
                  onclick={() => {
                    window.dispatchEvent(new CustomEvent(BRAND_EVENTS.openNotifications));
                  }}
                >
                  Open activity log
                </Button>
              </div>
            </div>
          </div>
        {/snippet}
      </svelte:boundary>
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>

<!-- Agent chat + global dialogs use the shared ErrorBoundary so a render
     error in any of them shows the standard "something went wrong" panel
     with a Try-again button instead of silently swallowing the crash.
     The chat error handler also logs to the activity feed via the
     existing handleAgentError. -->
<!-- Cross-platform offline banner. Sits above the layout chrome so it's
     always the topmost element. -->
<OfflineIndicator />

<ErrorBoundary title="Agent chat crashed">
  <AgentChat />
</ErrorBoundary>
<GlobalSearch />
<ErrorBoundary title="Add-job dialog crashed">
  <AddJobDialog />
</ErrorBoundary>
<ErrorBoundary title="Post-rejection sheet crashed">
  <PostRejectionSheet />
</ErrorBoundary>
<Toaster />
