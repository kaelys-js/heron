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
          <image
            width="1024"
            height="1024"
            preserveAspectRatio="xMidYMid meet"
            href="data:image/webp;base64,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"
          />
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
