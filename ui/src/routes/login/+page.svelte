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

  async function signInWithPasskey() {
    busy = true;
    // Don't clear `error = null` here -- that causes the inline banner
    // to unmount, then remount with the (same) message on the next
    // failed attempt, jumping the layout. We only clear on SUCCESS;
    // on retry-and-fail the existing banner just stays put with the
    // new copy. If the new error is identical to the previous one,
    // Svelte detects no change and the DOM doesn't even update.
    try {
      const result = await authClient.signIn.passkey({
        autoFill: false,
      });
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
  <!-- Soft brand-colored gradient bloom in the background. Positioned
       behind the card so the page never feels like a flat tax-form. -->
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    style="background:
      radial-gradient(60rem 40rem at 50% -10%, rgba(122, 140, 109, 0.22), transparent 60%),
      radial-gradient(40rem 30rem at 100% 100%, rgba(74, 91, 109, 0.14), transparent 60%),
      radial-gradient(36rem 28rem at 0% 100%, rgba(200, 155, 74, 0.12), transparent 60%);"
  ></div>

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
        <defs>
          <linearGradient id="login-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4a5b6d" />
            <stop offset="55%" stop-color="#7a8c6d" />
            <stop offset="100%" stop-color="#c89b4a" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" rx="232" fill="url(#login-bg)" />
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
