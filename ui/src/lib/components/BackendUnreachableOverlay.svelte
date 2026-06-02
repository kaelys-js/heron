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
  import { RefreshCw } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';
  import { BRAND, BRAND_STORAGE_KEYS } from '$lib/client/brand';
  import ConnectivityCard from './ConnectivityCard.svelte';

  // After 4s of being offline we consider the backend "unreachable" and
  // show the overlay. Shorter than this would nag during normal WiFi
  // flaps; longer would leave the user staring at empty UI.
  const RECONNECT_GRACE_MS = 4_000;
  // Once the overlay is up, probe every 2s. Faster would heat the radio
  // on a flaky network for no benefit (the probe is async; user perceives
  // the same UX at 2s vs 1s).
  const PROBE_INTERVAL_MS = 2_000;

  // `preview` is dev-only (the /dev/views gallery): force the overlay visible
  // so the state can be inspected without dropping the real backend. `onDismiss`
  // lets the gallery close its full-screen preview when an action button is
  // tapped in preview mode (otherwise the "Close preview" button lingers).
  let { preview = false, onDismiss } = $props<{ preview?: boolean; onDismiss?: () => void }>();

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
    // In the dev-view preview there's no real outage to recover from; just
    // close the gallery preview so the action reads as "done".
    if (preview) {
      onDismiss?.();
      return;
    }
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
    Full-screen overlay. ConnectivityCard owns the chrome (z-[100] container,
    bloom backdrop, glass card, reed-green brand mark) — it sits above toasts
    (z-50) but below the boot-fallback (z-9999, gone by the time this mounts)
    so the user can't double-stack two error UIs. This component supplies the
    status copy + the retry / continue-offline actions.
  -->
  <ConnectivityCard
    role="alertdialog"
    ariaLabelledby="backend-unreachable-title"
    headingId="backend-unreachable-title"
    {eyebrow}
    eyebrowClass="text-accent"
    {heading}
    {body}
    {actions}
    {details}
  />
{/if}

{#snippet eyebrow()}
  Reconnecting
{/snippet}

{#snippet heading()}
  Can't reach {BRAND.displayName}
{/snippet}

{#snippet body()}
  The server isn't responding right now. This usually clears up on its own — your latest data is
  safe.
{/snippet}

{#snippet actions()}
  <Button
    onclick={retry}
    disabled={retrying}
    aria-busy={retrying}
    class="mt-2 w-full gap-2"
    size="lg"
  >
    {#if retrying}
      <span
        class="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      ></span>
      Reconnecting…
    {:else}
      <RefreshCw class="size-4" />
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
{/snippet}

{#snippet details()}
  <p class="text-[11px] text-muted-foreground/70">
    Checking again in the background — this clears on its own once the server is back.
  </p>
{/snippet}
