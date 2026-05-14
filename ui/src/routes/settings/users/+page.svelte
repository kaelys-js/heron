<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus, Copy, X, Users as UsersIcon } from '@lucide/svelte';
  import { authClient } from '$lib/client/auth-client';
  import { goto, invalidateAll } from '$app/navigation';
  import { BRAND } from '$lib/client/brand';

  let { data } = $props<{
    data: {
      me: { id: string; email: string; name?: string | null; role: string };
      canSeeAll: boolean;
      users: Array<{
        id: string;
        email: string;
        name: string | null;
        role: string;
        createdAt: number;
        isMe: boolean;
      }>;
      invites: Array<{
        id: string;
        code: string;
        expiresAt: number;
        claimedByUserId: string | null;
        claimedAt: number | null;
        createdAt: number;
      }>;
      totalUsers: number;
    };
  }>();

  const canInvite = $derived(data.me.role === 'owner' || data.me.role === 'admin');

  let busy = $state(false);
  let newCode = $state<string | null>(null);
  let copied = $state<string | null>(null);

  async function generateInvite() {
    busy = true;
    try {
      const res = await fetch('/api/auth/invite/create', { method: 'POST' });
      const body = await res.json();
      if (body.ok) {
        newCode = body.code;
        await invalidateAll();
      }
    } finally {
      busy = false;
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    copied = code;
    setTimeout(() => (copied = null), 1500);
  }

  async function signOut() {
    busy = true;
    try {
      await authClient.signOut();
      await goto('/login', { invalidateAll: true });
    } finally {
      busy = false;
    }
  }

  function fmtRemaining(expiresAt: number): string {
    const ms = expiresAt - Date.now();
    if (ms <= 0) return 'expired';
    const mins = Math.floor(ms / 60_000);
    return mins + ' min left';
  }

  function fmtClaim(invite: (typeof data.invites)[number]): string {
    if (invite.claimedByUserId)
      return 'Claimed ' + new Date(invite.claimedAt ?? 0).toLocaleString();
    if (invite.expiresAt < Date.now()) return 'Expired';
    return fmtRemaining(invite.expiresAt);
  }
</script>

<svelte:head>
  <title>Users — {BRAND.displayName}</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-8 p-8">
  <header class="flex items-center justify-between">
    <h1 class="flex items-center gap-3 text-2xl font-semibold tracking-tight">
      <UsersIcon class="h-5 w-5" />
      Users
    </h1>
    <Button onclick={signOut} variant="outline" disabled={busy}>Sign out</Button>
  </header>

  <section class="space-y-2">
    <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
      Accounts ({data.totalUsers})
    </h2>
    <ul class="divide-y rounded-md border">
      {#each data.users as u}
        <li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p class="font-medium">{u.name ?? u.email}</p>
            <p class="text-xs text-muted-foreground">{u.email}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs">{u.role}</span>
            {#if u.isMe}<span class="text-xs text-muted-foreground">(you)</span>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Invite codes
      </h2>
      {#if canInvite}
        <Button onclick={generateInvite} disabled={busy} class="gap-2">
          <Plus class="h-4 w-4" /> Generate code
        </Button>
      {:else}
        <span class="text-xs text-muted-foreground">
          Ask the owner to generate an invite code for you.
        </span>
      {/if}
    </div>

    {#if newCode}
      <div
        class="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 p-4"
      >
        <div>
          <p class="text-xs text-muted-foreground">New invite code (valid 30 min)</p>
          <p class="font-mono text-3xl font-semibold tracking-widest">{newCode}</p>
        </div>
        <Button onclick={() => copyCode(newCode!)} size="sm" variant="outline" class="gap-2">
          <Copy class="h-4 w-4" />
          {copied === newCode ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    {/if}

    {#if data.invites.length > 0}
      <ul class="divide-y rounded-md border">
        {#each data.invites as inv}
          <li class="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p class="font-mono text-lg tracking-widest">{inv.code}</p>
              <p class="text-xs text-muted-foreground">{fmtClaim(inv)}</p>
            </div>
            {#if !inv.claimedByUserId && inv.expiresAt > Date.now()}
              <Button onclick={() => copyCode(inv.code)} size="sm" variant="ghost" class="gap-2">
                <Copy class="h-4 w-4" />
                {copied === inv.code ? 'Copied!' : 'Copy'}
              </Button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if !newCode}
      <p class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        No invite codes yet. Click "Generate code" to create one.
      </p>
    {/if}
  </section>
</main>
