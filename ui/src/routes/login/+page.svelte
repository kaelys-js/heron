<script lang="ts">
  /**
   * Login page — passkey-first sign-in, with optional GitHub OAuth and
   * invite-code-based signup links. The passkey button kicks off
   * WebAuthn via Better Auth's browser plugin; the GitHub button does a
   * standard OAuth redirect.
   *
   * Errors are surfaced inline. On success we redirect to the original
   * destination (`redirectTo` query param from the auth-guard middleware)
   * or '/' as a fallback.
   */
  import { authClient, markLocallyAuthed } from '$lib/client/auth-client';
  import { Button } from '$lib/components/ui/button';
  import { KeyRound, Code, Ticket, AlertCircle } from '@lucide/svelte';
  import { goto } from '$app/navigation';

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
        // Browser autofill: Safari/Chrome populate available passkeys
        // when the user taps the field, removing the need to remember
        // an email first. Falls back to the OS picker if no autofill.
        autoFill: false,
      });
      if (result?.error) {
        error = result.error.message ?? 'Sign-in failed';
      } else {
        // Mark localStorage flag so +layout.svelte's client-side gate
        // (which runs on Capacitor where hooks.server.ts can't) treats
        // subsequent visits as authenticated. The bearer token itself is
        // already captured by auth-client.ts's customFetchImpl. Both
        // signals get cleared in `clearLocalAuthState()` on sign-out.
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
      // OAuth flow redirects the browser; no need to navigate manually.
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in — career-ops</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8">
  <h1 class="mb-2 text-3xl font-semibold tracking-tight">Sign in</h1>
  <p class="mb-6 text-sm text-muted-foreground">
    Use your passkey to continue. Career-ops never stores passwords.
  </p>

  {#if error}
    <div
      class="mb-4 flex w-full items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      <AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{error}</span>
    </div>
  {/if}

  <div class="grid w-full gap-3">
    <Button onclick={signInWithPasskey} disabled={busy} class="justify-start gap-3">
      <KeyRound class="h-4 w-4" />
      Sign in with passkey
    </Button>

    {#if data.githubEnabled}
      <Button
        onclick={signInWithGitHub}
        disabled={busy}
        variant="outline"
        class="justify-start gap-3"
      >
        <Code class="h-4 w-4" />
        Continue with GitHub
      </Button>
    {/if}

    <Button href="/signup" disabled={busy} variant="ghost" class="justify-start gap-3">
      <Ticket class="h-4 w-4" />
      I have an invite code
    </Button>
  </div>

  <p class="mt-8 text-xs text-muted-foreground">
    First time here? The owner of this install can share an invite code from
    <code class="font-mono">Settings → Users</code>.
  </p>
</main>
