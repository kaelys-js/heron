<script lang="ts">
  import { docTitle } from '$lib/config/branding';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Mail, Network as Linkedin, RefreshCw } from '@lucide/svelte';

  let { data } = $props();

  let busy = $state<string | null>(null);
  let kindFilter = $state<string>('all');
  let stateFilter = $state<string>('all');

  const filteredLeads = $derived(
    data.leads.filter((l: any) => {
      if (kindFilter !== 'all' && l.kind !== kindFilter) return false;
      if (stateFilter !== 'all' && l.thread?.state !== stateFilter) return false;
      return true;
    }),
  );

  async function pollLinkedIn() {
    busy = 'poll';
    try {
      const res = await api.post<{ ok: boolean }>(
        '/api/run',
        { task: 'linkedin-dm' },
        { silent: true },
      );
      if (res.ok) {
        toast.success('LinkedIn DM ingest started — check activity feed');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  function kindTint(kind: string): string {
    if (kind === 'real-role')
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/40';
    if (kind === 'mass-blast') return 'bg-zinc-500/15 text-muted-foreground border-border';
    if (kind === 'scam') return 'bg-red-500/15 text-red-700 dark:text-red-200 border-red-500/40';
    if (kind === 'referral-ask')
      return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200 border-cyan-500/40';
    if (kind === 'status-update')
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/40';
    return 'bg-zinc-500/10 text-muted-foreground border-border';
  }

  function stateTint(state?: string): string {
    if (!state) return 'bg-zinc-500/10 text-muted-foreground';
    if (state === 'new') return 'bg-violet-500/15 text-violet-700 dark:text-violet-200';
    if (state === 'drafted') return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200';
    if (state === 'sent' || state === 'awaiting-reply')
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-200';
    if (state === 'engaged') return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-200';
    if (state === 'went-silent') return 'bg-amber-500/15 text-amber-700 dark:text-amber-200';
    if (state === 'closed') return 'bg-zinc-500/5 text-muted-foreground';
    return 'bg-zinc-500/10 text-muted-foreground';
  }

  function ago(ms: number): string {
    const d = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
    if (d === 0) return 'today';
    if (d === 1) return '1d';
    return d + 'd';
  }
</script>

<svelte:head>
  <title>{docTitle(['Inbound leads'])}</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-6">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Inbound recruiter leads</h1>
      <p class="text-sm text-muted-foreground">{data.leads.length} total · email + LinkedIn DMs</p>
    </div>
    <Button onclick={pollLinkedIn} disabled={busy !== null}>
      <RefreshCw class="mr-2 size-4" />
      {busy === 'poll' ? 'Polling...' : 'Pull new DMs'}
    </Button>
  </header>

  <div class="flex flex-wrap gap-2">
    <label class="text-xs">
      <span class="text-muted-foreground">Kind</span>
      <select
        bind:value={kindFilter}
        class="ml-2 rounded border border-input bg-background px-2 py-1"
      >
        <option value="all">all</option>
        <option value="real-role">real-role</option>
        <option value="mass-blast">mass-blast</option>
        <option value="scam">scam</option>
        <option value="referral-ask">referral-ask</option>
        <option value="status-update">status-update</option>
        <option value="unknown">unknown</option>
      </select>
    </label>
    <label class="text-xs">
      <span class="text-muted-foreground">State</span>
      <select
        bind:value={stateFilter}
        class="ml-2 rounded border border-input bg-background px-2 py-1"
      >
        <option value="all">all</option>
        <option value="new">new</option>
        <option value="reviewed">reviewed</option>
        <option value="drafted">drafted</option>
        <option value="sent">sent</option>
        <option value="awaiting-reply">awaiting-reply</option>
        <option value="engaged">engaged</option>
        <option value="went-silent">went-silent</option>
        <option value="closed">closed</option>
      </select>
    </label>
  </div>

  {#if filteredLeads.length === 0}
    <div class="rounded-lg border border-border bg-card p-8 text-center">
      <p class="text-muted-foreground">No inbound leads match these filters.</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each filteredLeads as l (l.id)}
        <a
          href={`/inbound/${l.id}`}
          class="block rounded-lg border border-border bg-card p-4 hover:border-input"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                {#if l.channel === 'linkedin-dm'}
                  <Linkedin class="size-3.5 text-sky-700 dark:text-sky-400" />
                {:else}
                  <Mail class="size-3.5 text-muted-foreground" />
                {/if}
                <span class="font-medium truncate">{l.senderName || '(unknown sender)'}</span>
                <span class="rounded border px-1.5 py-0.5 text-[11px] {kindTint(l.kind)}"
                  >{l.kind}</span
                >
                {#if l.thread?.state}
                  <span class="rounded px-1.5 py-0.5 text-[11px] {stateTint(l.thread.state)}"
                    >{l.thread.state}</span
                  >
                {/if}
                <span class="ml-auto text-xs text-muted-foreground">{ago(l.arrivedAt)}</span>
              </div>
              {#if l.subject}
                <div class="mt-1 text-sm text-foreground">{l.subject}</div>
              {/if}
              <div class="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {l.body.slice(0, 240)}
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
