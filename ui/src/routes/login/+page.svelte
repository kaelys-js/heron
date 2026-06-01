<script lang="ts">
  /**
   * Login page -- passkey-first sign-in with optional GitHub OAuth and
   * invite-code-based signup. Designed as the user's FIRST visual
   * impression of the app, so the layout treats the brand mark as a
   * hero element above the form, mirrors the boot-fallback's gradient
   * energy, and keeps copy under 8 words per line for mobile reading.
   *
   * Errors surface inline above the form. On success we mark the local
   * auth flag (so the Capacitor client-side gate accepts subsequent
   * navigations) and redirect to the original destination.
   */
  import { authClient, markLocallyAuthed } from '$lib/client/auth-client';
  import { setPasskeyTrigger } from '$lib/client/auth-menu';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import BloomBackground from '$lib/components/BloomBackground.svelte';
  import { KeyRound, Ticket, AlertCircle, ShieldCheck } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { APP_NAME } from '$lib/config/branding';
  // `slide` animates height + opacity together, so the error banner
  // grows DOWN from zero-height instead of popping fully formed into
  // existence -- eliminates the layout jump when the banner first
  // appears (or disappears on success).
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let { data } = $props<{
    data: { githubEnabled: boolean; redirectTo: string };
  }>();

  let busy = $state(false);
  let error = $state<string | null>(null);

  /**
   * Translate raw passkey/WebAuthn errors into copy a non-engineer can act
   * on. Better-auth surfaces things like "Auth cancelled" / "NotAllowedError"
   * / "The operation either timed out or was not allowed" -- none of which
   * tell the user what to do next. The mapper below covers every error code
   * a browser or Capacitor WebView can emit during a passkey sign-in, plus
   * a sane default for anything we haven't seen yet.
   *
   * The biggest source of mysterious "Auth cancelled" errors is a first-
   * time user pressing "Sign in with passkey" before they've ever created
   * one -- the platform throws NotAllowedError because there's no credential
   * to choose. We catch that and redirect them to the invite-code flow.
   */
  function friendlyAuthError(raw: unknown): string {
    const msg =
      raw instanceof Error
        ? raw.message
        : typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object' && 'message' in raw
            ? String((raw as { message: unknown }).message ?? '')
            : '';
    const name =
      raw instanceof Error
        ? raw.name
        : raw && typeof raw === 'object' && 'name' in raw
          ? String((raw as { name: unknown }).name ?? '')
          : '';
    const haystack = (name + ' ' + msg).toLowerCase();

    if (
      haystack.includes('cancel') ||
      haystack.includes('aborted') ||
      haystack.includes('notallowed') ||
      haystack.includes('timeout') ||
      haystack.includes('timed out') ||
      haystack.includes('not allowed')
    ) {
      // The user dismissed the system prompt, or there's no passkey
      // registered for this site on this device. Either way, point them
      // to the invite-code flow which is the only path that actually
      // creates one. Short, action-oriented copy.
      return 'No passkey on this device yet. Tap “Set up with invite code” below to create one.';
    }
    if (haystack.includes('not supported') || haystack.includes('unsupported')) {
      return "This device doesn't support passkeys.";
    }
    if (
      haystack.includes('network') ||
      haystack.includes('fetch') ||
      // WebKit/iOS surface a failed fetch as the bare TypeError "Load failed"
      // (Chrome says "Failed to fetch", Firefox "NetworkError") -- none of which
      // contain "network", so match the WebKit phrasing explicitly. This is the
      // exact message users saw when the backend was unreachable on iOS.
      haystack.includes('load failed') ||
      haystack.includes('connection') ||
      haystack.includes('offline')
    ) {
      return `Couldn't reach the server. Open ${APP_NAME} on your computer (same Wi-Fi), then try again.`;
    }
    if (haystack.includes('invalid state') || haystack.includes('invalidstate')) {
      return 'This passkey is already set up — try signing in again.';
    }
    if (!msg) return 'Sign-in failed. Try again.';
    return msg;
  }

  /** Is a platform authenticator (Touch ID / Windows Hello / phone passkey)
   *  actually usable here? The desktop/Electron WebView exposes
   *  `PublicKeyCredential` but has NO authenticator, so `signIn.passkey()`
   *  HANGS forever (button stuck disabled, nothing happens). We feature-detect
   *  first and bail with guidance instead of hanging. */
  async function passkeyAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return false;
    }
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  async function signInWithPasskey() {
    if (!(await passkeyAvailable())) {
      // No usable authenticator (e.g. the desktop app) -- point them at the
      // invite-code flow rather than spinning forever.
      error = 'No passkey on this device yet. Tap “Set up with invite code” below to create one.';
      return;
    }
    busy = true;
    // Don't clear `error = null` here -- that causes the inline banner
    // to unmount, then remount with the (same) message on the next
    // failed attempt, jumping the layout. We only clear on SUCCESS;
    // on retry-and-fail the existing banner just stays put with the
    // new copy. If the new error is identical to the previous one,
    // Svelte detects no change and the DOM doesn't even update.
    try {
      // Race against a timeout so a never-resolving WebAuthn prompt can't
      // strand the disabled button (belt-and-suspenders to the check above).
      const result = await Promise.race([
        authClient.signIn.passkey({ autoFill: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Passkey sign-in timed out')), 45_000),
        ),
      ]);
      if (result?.error) {
        error = friendlyAuthError(result.error);
      } else {
        error = null;
        markLocallyAuthed();
        await goto(data.redirectTo, { invalidateAll: true });
      }
    } catch (e) {
      error = friendlyAuthError(e);
    } finally {
      busy = false;
    }
  }

  async function signInWithGitHub() {
    busy = true;
    // Same rationale as signInWithPasskey -- keep the previous error
    // visible until we know the new attempt outcome.
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: data.redirectTo,
      });
      error = null;
    } catch (e) {
      // Same friendly mapper as passkey -- OAuth surfaces network /
      // cancellation errors identically and the user benefits from
      // consistent copy.
      error = friendlyAuthError(e);
      busy = false;
    }
  }

  // Electron: the native File menu's "Sign in with passkey" fires this. Register
  // the trigger while this page is mounted; clear it on unmount. No-op on web.
  onMount(() => {
    setPasskeyTrigger(() => void signInWithPasskey());
    return () => setPasskeyTrigger(null);
  });
</script>

<svelte:head>
  <title>Sign in — {APP_NAME}</title>
</svelte:head>

<!-- A <div>, not <main>: the root layout already wraps the page in
     <main id="main-content"> (the skip-link target), so a second <main> here
     would create a duplicate landmark (WCAG 1.3.1). The `.auth-page` class is
     what the bloom view-transition CSS keys off, so it stays. -->
<div
  class="auth-page relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 py-12"
>
  <!-- Dawn-sky bloom backdrop — centralized in BloomBackground (single source:
       splash-spec.mjs bloomCssInline via apply-brand), shared with the boot +
       splash screens + the dev-view states so every entry surface is one
       continuous identity. -->
  <BloomBackground />

  <!-- The content panel is its own view-transition group (`auth-content`) so the
       login↔signup swap MORPHS this box (short login → taller signup) and
       crossfades only its contents — instead of the whole `root` (toggle,
       particles, footer) crossfading and the form popping in at a mismatched Y. -->
  <div
    class="relative z-10 flex w-full max-w-sm flex-col items-center"
    style="view-transition-name: auth-content;"
  >
    <!-- Brand mark hero — mirrors branding/logo.svg + boot-fallback so
         the sign-in screen feels like the same app, not a generic gate. -->
    <div
      class="mb-7 flex size-16 items-center justify-center"
      style="filter: drop-shadow(0 6px 24px rgba(122, 140, 109, 0.35)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25)); view-transition-name: auth-hero;"
      aria-hidden="true"
    >
      <svg width="64" height="64" viewBox="0 0 1024 1024">
        <!-- AUTO-GENERATED:brand-mark gradient-id="login-bg" -->
        <image
          width="1024"
          height="1024"
          preserveAspectRatio="xMidYMid meet"
          href="data:image/webp;base64,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"
        />
        <!-- /AUTO-GENERATED:brand-mark -->
      </svg>
    </div>

    <!-- Headline + subhead. Short, on-brand, no marketing fluff. -->
    <h1 class="text-center text-3xl font-semibold tracking-tight">Welcome back</h1>
    <p class="mt-2 text-center text-sm text-muted-foreground">
      Sign in to your {APP_NAME} workspace
    </p>

    <!-- Error surface — appears above the form so it's the first thing
         the user reads on retry. -->
    {#if error}
      <!--
        Icon alignment: render as an INLINE element with
        `vertical-align: middle` inside the same `<p>` as the message
        text, NOT as a separate flex item. This delegates alignment
        to the browser's typography engine — `align-middle` aligns
        the icon's vertical center to the text's x-height center,
        which is what the eye reads as "centered with the text".
        Tracks font / line-height changes without magic-number
        margins. Icon stays on the first line; lines 2+ wrap to the
        start of the container — the standard pattern for an inline
        icon next to multi-line text.
      -->
      <div
        class="mt-6 flex w-full items-start gap-3 overflow-hidden rounded-xl border border-red-500/25 bg-red-500/[0.07] p-3.5 text-sm shadow-sm backdrop-blur-sm"
        role="alert"
        transition:slide={{ duration: 220, easing: cubicOut }}
      >
        <span
          class="mt-px flex size-7 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-300"
        >
          <AlertCircle class="size-4" />
        </span>
        <p class="leading-relaxed text-red-700 dark:text-red-200/90">{error}</p>
      </div>
    {/if}

    <!-- Card wrapping the actions. A subtle gradient border + glassy
         backdrop keeps the form anchored against the bloom. -->
    <div
      class="mt-6 w-full rounded-2xl border border-border/40 bg-card/60 p-5 shadow-2xl backdrop-blur-xl"
    >
      <!-- Primary action: passkey. Discoverable / usernameless — the button IS
           the whole flow (no username field; conditional-UI autofill needs an
           email anchor that doesn't fit a passkey-first design). Gradient sheen
           so it reads as THE action; h-12 for a comfortable mobile tap target.
           aria-busy + the label swap announce the in-flight ceremony (SC 4.1.3). -->
      <Button
        onclick={signInWithPasskey}
        disabled={busy}
        aria-busy={busy}
        class="h-12 w-full justify-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 disabled:opacity-60"
      >
        <KeyRound class="size-4" />
        {busy ? 'Waiting for passkey…' : 'Sign in with passkey'}
      </Button>

      {#if data.githubEnabled}
        <!-- Divider -- "or" with hairlines, classic auth pattern. -->
        <div
          class="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground/60"
        >
          <span class="h-px flex-1 bg-border/60"></span>
          or
          <span class="h-px flex-1 bg-border/60"></span>
        </div>

        <Button
          onclick={signInWithGitHub}
          disabled={busy}
          aria-busy={busy}
          variant="outline"
          class="h-11 w-full justify-center gap-2 border-border/60 bg-background/40 font-medium"
        >
          <!-- Inline GitHub octocat — lucide-svelte dropped branded
               icons; this is the upstream GitHub mark in SVG path form,
               which is allowed under GitHub's brand guidelines for
               "sign in with GitHub" buttons. -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Continue with GitHub
        </Button>
      {/if}

      <!-- Divider above the invite-code button if GitHub isn't enabled
           (GitHub's "or" divider doesn't render, so the invite CTA
           would otherwise sit immediately under the passkey button
           with no breathing room). -->
      {#if !data.githubEnabled}
        <div
          class="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground/60"
        >
          <span class="h-px flex-1 bg-border/60"></span>
          new here?
          <span class="h-px flex-1 bg-border/60"></span>
        </div>
      {/if}

      <!-- Invite-code button — peer to the passkey + GitHub buttons,
           same outline-button visual so the action stack reads as a
           coherent list of sign-in options rather than "primary CTA +
           hidden text link". For first-time users this IS the primary
           path; we just don't visually outrank the passkey since
           returning users are the more common case. -->
      <Button
        href="/signup"
        variant="outline"
        disabled={busy}
        class={`h-12 w-full justify-center gap-2 border-border/60 bg-background/40 font-medium ${data.githubEnabled ? 'mt-3' : 'mt-0'}`}
      >
        <Ticket class="size-4" />
        Set up with invite code
      </Button>
    </div>

    <!-- Reassurance / trust signal. Modern apps include this — it
         answers the unspoken "is this safe?" question right at the
         decision point. Copy describes the SECURITY MODEL accurately
         (passkey private key never leaves the device) without
         marketing-speak like "end-to-end" which is properly a term
         for E2E encryption and not what passkeys actually are. -->
    <div
      class="mt-6 flex items-center gap-2 rounded-full bg-emerald-500/8 px-3 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300/80"
    >
      <ShieldCheck class="size-3.5" />
      <span>Private by design · Your device is the key</span>
    </div>
  </div>
</div>
