<script lang="ts">
  /**
   * Login page — passkey-first sign-in with optional GitHub OAuth and
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

  let { data } = $props<{
    data: { githubEnabled: boolean; redirectTo: string };
  }>();

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function signInWithPasskey() {
    busy = true;
    error = null;
    try {
      const result = await authClient.signIn.passkey({
        autoFill: false,
      });
      if (result?.error) {
        error = result.error.message ?? 'Sign-in failed';
      } else {
        markLocallyAuthed();
        await goto(data.redirectTo, { invalidateAll: true });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function signInWithGitHub() {
    busy = true;
    error = null;
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: data.redirectTo,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
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
      radial-gradient(60rem 40rem at 50% -10%, rgba(139, 92, 246, 0.22), transparent 60%),
      radial-gradient(40rem 30rem at 100% 100%, rgba(99, 102, 241, 0.14), transparent 60%),
      radial-gradient(36rem 28rem at 0% 100%, rgba(168, 85, 247, 0.12), transparent 60%);"
  ></div>

  <div class="relative z-10 flex w-full max-w-sm flex-col items-center">
    <!-- Brand mark hero — mirrors branding/logo.svg + boot-fallback so
         the sign-in screen feels like the same app, not a generic gate. -->
    <div
      class="mb-7 flex size-16 items-center justify-center"
      style="filter: drop-shadow(0 6px 24px rgba(139, 92, 246, 0.35)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));"
      aria-hidden="true"
    >
      <svg width="64" height="64" viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="login-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="55%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#a855f7" />
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
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          <path
            d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"
          />
          <path
            d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"
          />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" />
        </g>
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
      <div
        class="mt-6 flex w-full items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
        role="alert"
      >
        <AlertCircle class="mt-0.5 size-4 flex-shrink-0" />
        <span class="leading-relaxed">{error}</span>
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
        <!-- Divider — "or" with hairlines, classic auth pattern. -->
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

      <!-- Invite link — secondary, ghost-styled, sits at the bottom of
           the card so first-time visitors see it without it competing
           with the primary sign-in. -->
      <a
        href="/signup"
        class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
        class:pointer-events-none={busy}
        class:opacity-50={busy}
      >
        <Ticket class="size-4" />
        I have an invite code
      </a>
    </div>

    <!-- Reassurance / trust signal. Modern apps include this — it
         answers the unspoken "is this safe?" question right at the
         decision point. -->
    <div
      class="mt-6 flex items-center gap-2 rounded-full bg-emerald-500/8 px-3 py-1.5 text-[11px] text-emerald-300/80"
    >
      <ShieldCheck class="size-3.5" />
      <span>Passkeys, end-to-end. No passwords stored.</span>
    </div>

    <!-- First-time hint — small, easily ignored if irrelevant. -->
    <p class="mt-6 text-center text-xs text-muted-foreground/70 leading-relaxed">
      First time here? Ask the owner of this install for an invite code
      <span class="text-muted-foreground">— check Settings → Users.</span>
    </p>
  </div>
</main>
