<!--
  BackendUnreachableOverlay — full-screen blocker shown when the API
  backend has been unreachable for more than RECONNECT_GRACE_MS.

  Why it exists separately from OfflineIndicator:
    OfflineIndicator is a SMALL pill at the top of the viewport — easy
    to miss, and the rest of the app behind it sits in a half-broken
    state with empty data + spurious 401/500 toasts. When the backend
    is fundamentally unreachable (dev server stopped, Tailscale
    dropped, LAN moved), the user needs a HARD signal + a retry
    affordance, not a status pill they may not see.

  When it shows:
    • online-status reports `online: false` AND the failure has
      persisted longer than RECONNECT_GRACE_MS (default 4s — short
      enough to feel responsive, long enough to ride out the typical
      WiFi flap or slow API call without nagging the user).
    • The probe re-checks every PROBE_INTERVAL_MS while the overlay is
      visible. As soon as health comes back, the overlay fades out.

  Visual:
    Matches the boot-fallback / error.html design language so a user
    who saw the loading screen and then hits this overlay perceives
    one continuous "we're trying to reach the server" narrative.
    Brand bloom background + brand mark + status copy + Retry button.

  Tap Retry → calls `onlineStore.refresh()` + `resetApiBase()` so both
  the navigator.onLine probe AND the backend-discovery cache get
  cleared and re-probed. If the server is back, the overlay
  disappears within ~500ms (one probe cycle).
-->
<script lang="ts">
  import { onlineStore } from '$lib/client/online-status.svelte';
  import { resetApiBase, getApiBase } from '$lib/client/api-base';
  import { Button } from '$lib/components/ui/button';
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { BRAND, BRAND_STORAGE_KEYS } from '$lib/client/brand';

  // After 4s of being offline we consider the backend "unreachable" and
  // show the overlay. Shorter than this would nag during normal WiFi
  // flaps; longer would leave the user staring at empty UI.
  const RECONNECT_GRACE_MS = 4_000;
  // Once the overlay is up, probe every 2s. Faster would heat the radio
  // on a flaky network for no benefit (the probe is async; user perceives
  // the same UX at 2s vs 1s).
  const PROBE_INTERVAL_MS = 2_000;

  // `preview` is dev-only (the /dev/views gallery): force the overlay visible
  // so the state can be inspected without dropping the real backend.
  let { preview = false } = $props<{ preview?: boolean }>();

  let visible = $state(false);
  let retrying = $state(false);
  /** M9 -- once an authed user picks "Continue offline" we stop blocking
   *  them with the overlay for the rest of the session. The cached read
   *  store (lib/client/offline-cache.ts) serves last-known data behind
   *  the dismissed overlay. Resets when the backend recovers. */
  let dismissedThisSession = $state(false);
  /** True if we believe the user is signed in. localStorage AUTHED_KEY
   *  is set by auth-client on every successful sign-in / session-refresh
   *  and cleared on sign-out / session-expiry, so a true reading here
   *  means there's a cached bearer + cached reads that the offline UI
   *  can use. */
  let cachedAuth = $state(false);
  let offlineSince: number | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let probeInterval: ReturnType<typeof setInterval> | null = null;
  let unsub: (() => void) | null = null;

  function showOverlay() {
    visible = true;
    // Set up the recurring probe so we know when to disappear.
    if (probeInterval) clearInterval(probeInterval);
    probeInterval = setInterval(() => {
      void onlineStore.refresh();
    }, PROBE_INTERVAL_MS);
  }

  function hideOverlay() {
    visible = false;
    if (probeInterval) {
      clearInterval(probeInterval);
      probeInterval = null;
    }
  }

  /** Read the cached-auth signal once on mount and after every
   *  visibilitychange so we know whether to offer "Continue offline"
   *  alongside "Try again". */
  function readCachedAuth(): void {
    if (typeof localStorage === 'undefined') {
      cachedAuth = false;
      return;
    }
    cachedAuth = localStorage.getItem(BRAND_STORAGE_KEYS.authed) === '1';
  }

  onMount(() => {
    if (preview) {
      cachedAuth = true; // show the full set of affordances in the gallery
      visible = true;
      return;
    }
    readCachedAuth();
    // Track online → offline transitions. On going offline, start the
    // grace window. On coming back online, cancel the window, hide,
    // AND reset the session-dismissed flag so subsequent disconnects
    // re-prompt the user.
    unsub = onlineStore.addListener((online) => {
      if (online) {
        offlineSince = null;
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimer = null;
        }
        dismissedThisSession = false;
        hideOverlay();
      } else {
        if (offlineSince === null) {
          offlineSince = Date.now();
          graceTimer = setTimeout(() => {
            // Only show if STILL offline after the grace window AND
            // user hasn't already opted into offline mode this session.
            if (!onlineStore.online && !dismissedThisSession) showOverlay();
          }, RECONNECT_GRACE_MS);
        }
      }
    });
    // If we mount already offline (e.g. backgrounded the app and came
    // back to a dead server), start the grace window immediately.
    if (!onlineStore.online) {
      offlineSince = Date.now();
      graceTimer = setTimeout(() => {
        if (!onlineStore.online && !dismissedThisSession) showOverlay();
      }, RECONNECT_GRACE_MS);
    }
  });

  onDestroy(() => {
    if (graceTimer) clearTimeout(graceTimer);
    if (probeInterval) clearInterval(probeInterval);
    unsub?.();
  });

  async function retry() {
    if (retrying) return;
    retrying = true;
    try {
      // Reset BOTH backend-discovery (re-probes LAN / Tailscale / etc)
      // AND online-status (re-probes /api/health). Either may have a
      // stale cached result.
      resetApiBase();
      await getApiBase().catch(() => {
        /* error state handled via the listener */
      });
      await onlineStore.refresh();
    } finally {
      // Give the user a visible "I tried" beat even if the probe was
      // instantaneous -- feels more responsive than the button snapping
      // back to "Try again" before they let go.
      setTimeout(() => {
        retrying = false;
      }, 600);
    }
  }

  /** M9 -- dismiss the overlay and let the user continue with cached
   *  data. The offline-read cache (lib/client/offline-cache.ts) serves
   *  last-known job list / stats / notifications behind the dismissed
   *  overlay. We don't hide forever: a hard network change re-runs
   *  showOverlay() via the listener path, but `dismissedThisSession`
   *  gates the show; only an online→offline→online cycle re-prompts. */
  function continueOffline(): void {
    dismissedThisSession = true;
    hideOverlay();
  }
</script>

{#if visible}
  <!--
    Full-screen overlay. z-[100] sits above toasts (z-50) but below the
    boot-fallback (z-9999, which is gone by the time this mounts) so
    the user can't accidentally double-stack two error UIs.
  -->
  <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="backend-unreachable-title"
    class="fixed inset-0 z-[100] flex items-center justify-center p-6"
    transition:fade={{ duration: 200 }}
  >
    <!-- Backdrop with brand bloom — matches boot-fallback for visual
         continuity (user feels they're in one "still loading" state). -->
    <div
      aria-hidden="true"
      class="absolute inset-0 bg-[#0e1014]/95 backdrop-blur-md"
      style="background:
        radial-gradient(circle at 50% 50%, rgba(122, 140, 109, 0.20) 0%, rgba(74, 91, 109, 0.10) 32%, rgba(200, 155, 74, 0.05) 56%, transparent 78%),
        rgba(10, 10, 11, 0.95);"
    ></div>

    <!-- Card -->
    <div
      class="relative w-full max-w-sm flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/80 p-8 text-center shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] backdrop-blur-lg"
    >
      <!-- Brand mark — mirrors branding/logo.svg via apply-brand's
           AUTO-GENERATED:brand-mark marker pair, scaled down. Drop
           shadow matches boot-fallback's halo. -->
      <div
        class="size-16 drop-shadow-[0_0_24px_rgba(139,92,246,0.35)] drop-shadow-[0_6px_16px_rgba(139,92,246,0.2)]"
      >
        <svg viewBox="0 0 1024 1024" aria-hidden="true" class="block size-full">
          <!-- AUTO-GENERATED:brand-mark gradient-id="bu-grad" -->
          <defs>
            <linearGradient id="bu-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4a5b6d" />
              <stop offset="55%" stop-color="#7a8c6d" />
              <stop offset="100%" stop-color="#c89b4a" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" rx="232" fill="url(#bu-grad)" />
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
        <div class="text-[11px] font-semibold uppercase tracking-wider text-red-300">
          Disconnected
        </div>
        <h2 id="backend-unreachable-title" class="text-lg font-semibold tracking-tight">
          Can't reach {BRAND.displayName}
        </h2>
      </div>

      <p class="text-sm leading-relaxed text-muted-foreground">
        We're not getting a response from the server. This usually clears up on its own — your
        latest data is safe.
      </p>

      <Button onclick={retry} disabled={retrying} class="mt-2 w-full gap-2" size="lg">
        {#if retrying}
          <span
            class="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          ></span>
          Reconnecting…
        {:else}
          Try again
        {/if}
      </Button>

      {#if cachedAuth}
        <!-- M9 — authed users can continue with cached data (last-known
             job list / stats / notifications served from IndexedDB).
             Unauthed users have nothing to show offline, so the option
             stays hidden for them. -->
        <Button variant="ghost" onclick={continueOffline} class="w-full" size="sm">
          Continue offline with cached data
        </Button>
      {/if}

      <p class="text-[11px] text-muted-foreground/70">
        We'll keep checking in the background and dismiss this when the server comes back.
      </p>
    </div>
  </div>
{/if}
