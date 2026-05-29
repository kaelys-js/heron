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
  import { Button } from '$lib/components/ui/button';
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
      return 'No passkey on this device yet. Set one up below with an invite code.';
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
      error = 'No passkey on this device yet. Set one up below with an invite code.';
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
</script>

<svelte:head>
  <title>Sign in — {APP_NAME}</title>
</svelte:head>

<main
  class="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 py-12"
>
  <!-- Dawn-sky bloom backdrop. SINGLE SOURCE: scripts/native/splash-spec.mjs
       (bloomCssInline) via apply-brand -- shared with the boot + splash
       screens so every entry surface is one continuous identity. Regenerate
       with `pnpm brand:apply`; do NOT hand-edit between the markers. -->
  <!-- AUTO-GENERATED:splash-bloom -->
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    style="background: radial-gradient(135% 100% at 50% 50%, transparent 46%, rgba(0, 0, 0, 0.42) 100%), radial-gradient(120% 85% at 50% 116%, rgba(200, 155, 74, 0.34) 0%, rgba(200, 155, 74, 0.12) 30%, transparent 58%), radial-gradient(135% 95% at 50% 104%, rgba(122, 140, 109, 0.2) 0%, transparent 62%), radial-gradient(80% 62% at 50% 40%, rgba(74, 91, 109, 0.26) 0%, rgba(122, 140, 109, 0.1) 46%, transparent 74%), linear-gradient(180deg, #090b0f 0%, #0e1014 44%, #11151c 100%);"
  ></div>
  <!-- /AUTO-GENERATED:splash-bloom -->

  <div class="relative z-10 flex w-full max-w-sm flex-col items-center">
    <!-- Brand mark hero — mirrors branding/logo.svg + boot-fallback so
         the sign-in screen feels like the same app, not a generic gate. -->
    <div
      class="mb-7 flex size-16 items-center justify-center"
      style="filter: drop-shadow(0 6px 24px rgba(122, 140, 109, 0.35)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));"
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
        class="mt-6 w-full overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200"
        role="alert"
        transition:slide={{ duration: 220, easing: cubicOut }}
      >
        <p class="leading-relaxed">
          <AlertCircle class="mr-2 inline-block size-4 align-middle" />
          {error}
        </p>
      </div>
    {/if}

    <!-- Card wrapping the actions. A subtle gradient border + glassy
         backdrop keeps the form anchored against the bloom. -->
    <div
      class="mt-6 w-full rounded-2xl border border-border/40 bg-card/60 p-5 shadow-2xl backdrop-blur-xl"
    >
      <!-- Primary action: passkey. Solid + gradient sheen so it reads
           as THE action. The chevron-free button keeps the hierarchy
           clean. h-12 for a comfortable tap target on mobile. -->
      <Button
        onclick={signInWithPasskey}
        disabled={busy}
        class="h-12 w-full justify-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 disabled:opacity-60"
      >
        <KeyRound class="size-4" />
        Sign in with passkey
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
</main>
