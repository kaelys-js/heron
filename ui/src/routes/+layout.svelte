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
  import { page } from '$app/state';
  import { updateWidgets, isIos, setSharedBackendUrl } from '$lib/client/native-bridge';
  import { apiCall } from '$lib/api';
  import { installDeepLinkHandler, handleDeepLink } from '$lib/client/deep-links';
  import { onNotificationTap } from '$lib/client/notifications';
  import { installNotificationsBridge } from '$lib/client/sse-notifications-bridge';

  // Reactive auth flag — true ONLY when the user is on a private route
  // AND has the local auth marker set. Used to gate the floating UI
  // (AgentChat FAB, GlobalSearch, dialogs) so unauthenticated screens
  // (/login, /signup, /help) never accidentally show app-shell controls.
  // Updates live as the route changes so signing out hides the FAB
  // immediately, and signing in reveals it on the very next navigation.
  let pathname = $derived(page.url.pathname);
  let isAuthed = $derived.by(() => {
    if (typeof window === 'undefined') return false;
    if (isPublicRoute(pathname)) return false;
    return localStorage.getItem('career-ops:authed') === '1';
  });

  // Auth screens (login / signup) are full-viewport centered cards with
  // NO scrollable content. iOS WKWebView still rubber-band-scrolls and
  // allows text selection on them by default, which makes them feel
  // un-app-like. We add a `.auth-screen` body class on those routes and
  // app.css locks body overflow + user-select. Other public routes
  // (/help, /onboarding) keep normal scroll behaviour because their
  // content is long and selectable text is useful (read articles, copy
  // codes, etc.).
  let isAuthScreen = $derived(
    pathname === '/login' ||
      pathname === '/signup' ||
      pathname.startsWith('/login/') ||
      pathname.startsWith('/signup/'),
  );
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('auth-screen', isAuthScreen);
  });

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
    // Track the SSE bridge teardown so we can stop it on cleanup.
    let stopNotificationsBridge: (() => void) | null = null;

    void import('$lib/client/api-base').then(({ getApiBase }) =>
      getApiBase()
        .then((base) => {
          if (base) setReporterBackend(base);
          // Mirror the resolved backend URL into App Group UserDefaults so
          // the Share Extension knows where to POST. No-op on web/desktop.
          // Even an empty base on web is mirrored as '' which clears any
          // stale value from a prior native session.
          void setSharedBackendUrl(base || null);
          // Install the SSE → notification + widget-stale bridge. The
          // bridge listens to /api/notifications, fires OS notifications
          // for warn/error/success events AND dispatches a widget-stale
          // CustomEvent on every event with a widget-relevant source
          // (apply-*, interview-*, scan-*, issue*). Widget refresh
          // listener was installed below.
          if (base || typeof window !== 'undefined') {
            stopNotificationsBridge = installNotificationsBridge(base || window.location.origin);
          }
        })
        .catch(() => {
          /* OfflineIndicator surfaces the failure */
        }),
    );

    // Splash dismiss + boot-fallback removal — SEQUENCED handover so
    // the user sees three distinct, clean phases instead of overlapping
    // fades:
    //
    //   1. native-splash visible (iOS LaunchScreen, painted by the OS)
    //   2. SHORT crossfade to boot-fallback (same bg, same icon, no jump)
    //   3. branded boot-fallback alone, with dots animating
    //   4. boot-fallback fades to reveal SvelteKit shell
    //
    // Why sequenced rather than simultaneous: the previous version
    // fired SplashScreen.hide + setAttribute('data-hide','1') in the
    // SAME rAF, so the native splash AND the boot-fallback faded out
    // in parallel — the user briefly saw BOTH at half-opacity, which
    // reads as a hesitation / "gap". Sequencing them means the splash
    // hands off to a SOLID boot-fallback, the boot stays solid for a
    // perception beat, then fades to the app cleanly.
    //
    // BOOT_FALLBACK_MIN_MS is the minimum delay from layout-mount to
    // splash-hide. Measured: on a cold WKWebView launch in production
    // mode, the WebView takes ~900-1100ms to FULLY paint the boot-
    // fallback's bloom gradient + glow filter — even though hydration
    // itself finishes in <200ms. Hiding the splash sooner means the
    // user sees a black "gap" while the WebView is still compositing.
    // 1100ms covers the slow path; the splash shares the same
    // #0a0a0b bg as the boot-fallback, so this just feels like a
    // longer brand-dark splash rather than a delay.
    const BOOT_FALLBACK_MIN_MS = 1100;
    // Instant splash hide — the boot-fallback's bg is IDENTICAL to the
    // splash's bg (both #0a0a0b, both already painted), so a fade-out
    // is just visual noise. 0ms = immediate cut, invisible to the eye.
    const SPLASH_FADE_MS = 0;
    const BOOT_PERCEPTION_MS = 400; // user briefly sees boot-fallback alone
    setTimeout(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(async () => {
          // Phase 1: hide the native splash. Quick crossfade — the
          // boot-fallback is already painted underneath with an IDENTICAL
          // bg + icon, so this is a visually invisible cut.
          try {
            const { SplashScreen } = await import('@capacitor/splash-screen');
            await SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_MS });
          } catch {
            /* not running native; nothing to dismiss */
          }

          // Phase 2: wait for the splash fade to finish + a perception
          // beat. During this window the boot-fallback is the ONLY thing
          // on screen, dots animating, identity continuous from the
          // splash. Skipping this would make the splash feel like it
          // cuts straight to the app, hiding our branded loading state.
          await new Promise((r) => setTimeout(r, SPLASH_FADE_MS + BOOT_PERCEPTION_MS));

          // Phase 3: fade out the boot-fallback. Its CSS `transition:
          // opacity 300ms ease-out` does the visual work; we remove the
          // node 300ms later so it stops blocking pointer events.
          if (typeof document !== 'undefined') {
            const bootFallback = document.getElementById('boot-fallback');
            if (bootFallback) {
              bootFallback.setAttribute('data-hide', '1');
              setTimeout(() => bootFallback.remove(), 300);
            }
          }
        }),
      );
    }, BOOT_FALLBACK_MIN_MS);

    // Deep-link routing — the OS hands us `careerops://` URLs whenever
    // the user taps a widget, Live Activity, or Share Extension success
    // callback. Without this, every tap drops the user at the dashboard
    // root regardless of what they tapped. Capacitor's @capacitor/app
    // plugin is the source; deep-links.ts parses + routes.
    installDeepLinkHandler();

    // Local-notification taps. Notifications scheduled via the unified
    // notify() API stash a `careerops://` deep link in `extra.deepLink`;
    // when the user taps, this listener resolves + navigates. Without
    // it the app opens to the root on tap (no context).
    const removeNotificationListener = onNotificationTap((deepLink) => {
      handleDeepLink(deepLink);
    });

    // iOS Home Screen / Lock Screen / Watch widget refresh pipeline.
    //
    // The widgets read App Group UserDefaults that ONLY the iPhone main
    // app can write to (Apple's sandbox model — extension targets can
    // read, but it's the host app's job to feed). Without this fetch,
    // every widget renders the empty / "Sign in on iPhone" placeholder
    // forever, even for an authenticated user with a populated queue.
    //
    // Refresh strategy:
    //   • Cold boot: fetch + push immediately after the auth probe wins.
    //   • While the app is foregrounded: SSE-driven (Task 9). The
    //     activity-feed bus already notifies on every relevant event;
    //     sse-notifications-bridge listens and re-fetches.
    //   • App resumes from background: visibilitychange listener
    //     re-fetches so the user sees fresh data when they pull the app
    //     up. iOS itself coalesces widget refreshes to ~15min cycles, so
    //     we can't update faster than that on the widget surface, but
    //     a fresh App Group write means the NEXT cycle has fresh data.
    //
    // The `isIos()` short-circuit keeps web + desktop bundles from
    // wasting a fetch on a no-op call to a Capacitor plugin that
    // doesn't exist.
    async function refreshWidgetSnapshot() {
      if (typeof window === 'undefined' || !isIos()) return;
      try {
        const snap = await apiCall<{
          ok: boolean;
          authenticated: boolean;
          stats: { queued: number; appliedToday: number; upcomingInterviews: number };
          nextInterview: unknown | null;
          topApply: unknown | null;
          openIssues: unknown[];
        }>('/api/widgets/snapshot');
        if (!snap?.ok) return;
        await updateWidgets({
          authenticated: true,
          stats: snap.stats,
          nextInterview: snap.nextInterview as never,
          topApply: snap.topApply as never,
          openIssues: snap.openIssues as never,
        });
      } catch {
        // 401 = unauthenticated → updateWidgets({ authenticated: false })
        // is pushed from the sign-out path below. Other errors fall
        // through silently; the widgets keep their last-known good
        // state (App Group UserDefaults persist across launches).
      }
    }

    // Initial push. Fire-and-forget — don't block layout hydration.
    void refreshWidgetSnapshot();

    // Re-fetch on resume so a user backgrounding the app for hours and
    // returning sees fresh data immediately rather than waiting on the
    // next 15-min OS tick.
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshWidgetSnapshot();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    // Listen for the brand-internal refresh event — Task 9's SSE bridge
    // dispatches it whenever the activity feed reports a widget-relevant
    // event (apply state change, interview scheduled, issue added). The
    // bridge can't import `updateWidgets` directly without pulling
    // Capacitor into every page bundle, so we use a DOM CustomEvent as
    // the decoupling boundary.
    const onRefresh = () => void refreshWidgetSnapshot();
    if (typeof window !== 'undefined') {
      window.addEventListener(`${BRAND_EVENTS.notify}:widgets-stale`, onRefresh);
    }

    // Cleanup — onMount returns a teardown so HMR doesn't pile listeners.
    const teardown = () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener(`${BRAND_EVENTS.notify}:widgets-stale`, onRefresh);
      }
      removeNotificationListener();
      stopNotificationsBridge?.();
    };

    // Client-side auth gate. In adapter-node builds hooks.server.ts
    // bounces unauthenticated users to /login before the page ever
    // hydrates — but in adapter-static (Capacitor) hooks.server.ts
    // doesn't run, so we have to gate here.
    //
    // Two-layer check:
    //   1. SYNCHRONOUS — if there's no localStorage flag at all, redirect
    //      immediately. Wins the race against +page.svelte's onMount
    //      `goto('/inbox')`.
    //   2. ASYNCHRONOUS — even WITH the flag, probe the real session via
    //      authClient.getSession(). A stale flag (left over from a prior
    //      install where data persisted across uninstall in WKWebView's
    //      WebsiteData) would otherwise let unauthenticated users see the
    //      app shell. If the probe returns no session, clear the flag and
    //      redirect.
    //
    // PUBLIC_ROUTES + onboarding remain reachable in both layers.
    if (
      typeof window !== 'undefined' &&
      !isPublicRoute(window.location.pathname) &&
      !window.location.protocol.startsWith('http')
    ) {
      const path = window.location.pathname;
      // Layer 1: sync flag check — bounce immediately if no flag.
      if (localStorage.getItem('career-ops:authed') !== '1') {
        // window.location.replace cancels every in-flight SvelteKit
        // navigation, including the root +page.svelte's queueMicrotask
        // goto('/inbox') that would otherwise win the race.
        window.location.replace('/login?redirectTo=' + encodeURIComponent(path));
      } else {
        // Layer 2: async session probe. authClient.getSession() races
        // through the customFetch which awaits backend resolution. Cap at
        // 4s so an unreachable backend doesn't trap the user on a stale
        // shell — that case falls back to "treat as unauthed".
        const ctrl = new AbortController();
        const probeTimeout = setTimeout(() => ctrl.abort(), 4000);
        Promise.race([
          authClient.getSession({ fetchOptions: { signal: ctrl.signal } }).then((r) => r),
          new Promise<{ data: { user?: unknown } | null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 4000),
          ),
        ])
          .then((result) => {
            clearTimeout(probeTimeout);
            const user = (result as { data: { user?: unknown } | null })?.data?.user;
            if (!user) {
              // Real auth state says unauthenticated. Scrub the stale
              // flag (incl. bearer token) so the layer-1 check catches it
              // on the next page-load too.
              localStorage.removeItem('career-ops:authed');
              localStorage.removeItem('career-ops:bearer-token');
              // Hard-navigate (window.location), NOT SvelteKit goto.
              // The root +page.svelte enqueues `goto('/inbox')` in
              // onMount via queueMicrotask. Two SvelteKit goto()s race
              // and the last one wins — which is the wrong one. A
              // direct location.replace() cancels every in-flight
              // navigation and wins unconditionally.
              window.location.replace('/login?redirectTo=' + encodeURIComponent(path));
            }
          })
          .catch(() => {
            // Probe failed (backend unreachable / aborted). Treat as
            // unauthed so we never leave the user on a stranded app shell.
            localStorage.removeItem('career-ops:authed');
            localStorage.removeItem('career-ops:bearer-token');
            void goto('/login?redirectTo=' + encodeURIComponent(path), {
              replaceState: true,
            });
          });
      }
    }

    return teardown;
  });

  // Sign-out detector — when the `career-ops:authed` flag flips from set
  // to absent (the sign-out button in AppSidebar.svelte clears it), push
  // `{ authenticated: false }` so the iPhone widgets + Watch immediately
  // flip to the gate state. Without this, the widgets would keep their
  // last data on screen until the next 15-min refresh tick — leaking the
  // previous user's queue / interview info to anyone who picks up the phone.
  $effect(() => {
    if (typeof window === 'undefined' || !isIos()) return;
    // Track the flag's value so we only push when it transitions out of '1'.
    // Reading inside the effect makes Svelte track localStorage misses too,
    // but localStorage isn't a Svelte signal — so we also poll on the
    // existing 'storage' event (fires on cross-tab change) + the layout's
    // isAuthed derived (which re-evaluates on every nav).
    if (!isAuthed) {
      void updateWidgets({ authenticated: false });
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
                    class="mt-2 p-3 text-[11px] font-mono leading-snug bg-muted/30 border border-border/40 rounded-md max-h-48 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{error.stack}</pre>
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

<!-- Cross-platform offline banner. Sits above the layout chrome so it's
     always the topmost element. Always visible (no auth gate) because
     network state is relevant on /login too. -->
<OfflineIndicator />

<!--
  Auth-gated floating UI. AgentChat / GlobalSearch / AddJobDialog /
  PostRejectionSheet all operate on user data (or trigger workflows
  that mutate it). Rendering them on /login / /signup / /help leaks
  the in-app shell to unauthenticated users AND is confusing UX (why
  is there a "Chat with your agents" sparkle button on the sign-in
  page?). isAuthed is reactive, so signing out from /settings hides
  these immediately, and signing in reveals them on the very next
  navigation.

  ErrorBoundary stays around the AgentChat path so a render error in
  the chat panel never takes down the rest of the auth-required app.
-->
{#if isAuthed}
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
{/if}
<Toaster />
