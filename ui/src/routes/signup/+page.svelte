<script lang="ts">
  /**
   * Signup page — two modes:
   *
   *   • First-user (no users in DB): the user becomes the OWNER. Just
   *     name + email + passkey enrollment.
   *
   *   • Invite-required: the user types a 6-digit invite code (generated
   *     by an existing owner) + name + email + passkey. We POST the code
   *     to /api/auth/invite/claim before kicking off the passkey flow.
   *
   * Better Auth's passkey plugin handles the actual WebAuthn ceremony.
   * On success the session cookie is set and we redirect to /onboarding.
   */
  import { authClient } from '$lib/client/auth-client';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { KeyRound, AlertCircle } from '@lucide/svelte';
  import { goto } from '$app/navigation';

  let { data } = $props<{
    data: { isFirstUser: boolean; githubEnabled: boolean };
  }>();

  let name = $state('');
  let email = $state('');
  let inviteCode = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function createAccount() {
    error = null;
    if (!name.trim()) {
      error = 'Please enter your name.';
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      error = 'Please enter a valid email address.';
      return;
    }
    if (!data.isFirstUser && !/^\d{6}$/.test(inviteCode.trim())) {
      error = 'Invite code must be 6 digits.';
      return;
    }

    busy = true;
    try {
      // For non-first users, validate the invite code first so we don't
      // create a half-baked account before realising the code is bad.
      if (!data.isFirstUser) {
        const claim = await fetch('/api/auth/invite/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: inviteCode.trim(), email: email.trim() }),
        });
        if (!claim.ok) {
          const body = await claim.json().catch(() => null);
          error = body?.error?.message ?? 'Invite code not accepted.';
          busy = false;
          return;
        }
      }

      // Create the account via passkey. Better Auth's plugin will:
      //   1. Generate WebAuthn options
      //   2. Trigger the browser's passkey UI
      //   3. Persist the new user + credential
      //   4. Set the session cookie
      const result = await authClient.signUp.email({
        email: email.trim(),
        password: crypto.randomUUID(), // unused — emailAndPassword is disabled
        name: name.trim(),
      });

      if (result?.error) {
        error = result.error.message ?? 'Account creation failed.';
        busy = false;
        return;
      }

      // Immediately enroll a passkey for the new account.
      const pk = await authClient.passkey.addPasskey({
        name: name.trim() + "'s passkey",
      });
      if (pk?.error) {
        error = 'Account created but passkey enrollment failed: ' + (pk.error.message ?? '');
        busy = false;
        return;
      }

      await goto('/onboarding', { invalidateAll: true });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Sign up — career-ops</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8">
  <h1 class="mb-2 text-3xl font-semibold tracking-tight">
    {data.isFirstUser ? 'Welcome to career-ops' : 'Create your account'}
  </h1>
  <p class="mb-6 text-center text-sm text-muted-foreground">
    {#if data.isFirstUser}
      The first account becomes the owner. You can invite others later.
    {:else}
      Enter your invite code, name, and email. You'll set up a passkey for sign-in.
    {/if}
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

  <form
    class="grid w-full gap-4"
    onsubmit={(e) => {
      e.preventDefault();
      createAccount();
    }}
  >
    {#if !data.isFirstUser}
      <div class="grid gap-2">
        <Label for="invite">Invite code</Label>
        <Input
          id="invite"
          bind:value={inviteCode}
          maxlength={6}
          inputmode="numeric"
          pattern="\d{6}"
          placeholder="123456"
          autocomplete="one-time-code"
          disabled={busy}
        />
      </div>
    {/if}

    <div class="grid gap-2">
      <Label for="name">Name</Label>
      <Input
        id="name"
        bind:value={name}
        placeholder="Alice Johnson"
        autocomplete="name"
        disabled={busy}
      />
    </div>

    <div class="grid gap-2">
      <Label for="email">Email</Label>
      <Input
        id="email"
        type="email"
        bind:value={email}
        placeholder="you@example.com"
        autocomplete="email"
        disabled={busy}
      />
    </div>

    <Button type="submit" disabled={busy} class="gap-3">
      <KeyRound class="h-4 w-4" />
      Create account & set up passkey
    </Button>
  </form>

  <p class="mt-8 text-xs text-muted-foreground">
    Already have an account? <a href="/login" class="underline">Sign in</a>
  </p>
</main>
