<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { KeyRound, Code, Ticket } from '@lucide/svelte';
  import { BRAND } from '$lib/client/brand';
  // Lucide's "github" icon was deprecated; use a generic Code icon
  // for the GitHub OAuth CTA. (Swap in an SVG mark if a branded
  // GitHub logo is required for compliance.)

  let { data } = $props<{
    data: { isFirstUser: boolean; githubEnabled: boolean };
  }>();
</script>

<svelte:head>
  <title>Welcome — {BRAND.displayName}</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-8">
  <header class="mb-8">
    <h1 class="text-3xl font-semibold tracking-tight">Welcome to {BRAND.displayName}</h1>
    <p class="mt-2 text-sm text-muted-foreground">
      {#if data.isFirstUser}
        The first account you create becomes the owner of this install. You can invite others later
        from <code class="font-mono text-xs">/settings/users</code>.
      {:else}
        Sign in to continue setup, or create a new account if someone shared an invite code with
        you.
      {/if}
    </p>
  </header>

  <section class="grid gap-3">
    {#if data.isFirstUser}
      <Button href="/signup?first=1" class="justify-start gap-3">
        <KeyRound class="h-4 w-4" />
        Create owner account with a passkey
      </Button>
      {#if data.githubEnabled}
        <Button
          href="/api/auth/sign-in/social?provider=github"
          variant="outline"
          class="justify-start gap-3"
        >
          <Code class="h-4 w-4" />
          Continue with GitHub
        </Button>
      {/if}
    {:else}
      <Button href="/login" class="justify-start gap-3">
        <KeyRound class="h-4 w-4" />
        Sign in
      </Button>
      <Button href="/signup" variant="outline" class="justify-start gap-3">
        <Ticket class="h-4 w-4" />
        I have an invite code
      </Button>
    {/if}
  </section>

  <p class="mt-8 text-xs text-muted-foreground">
    Heron stores your data locally. The owner account can invite household members or teammates with
    single-use codes that expire after 30 minutes.
  </p>
</main>
