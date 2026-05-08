<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { Briefcase, Loader2, Search, ArrowRight, FileText, Paperclip } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';
  import { globalActions } from '$lib/global-actions.svelte';
  import { api } from '$lib/api';
  import type { Status, BgRisk } from '$lib/types';

  type IndexedJob = {
    id: string;
    company: string;
    role: string;
    location: string;
    status: Status;
    score: number | null;
    bgRisk: BgRisk;
  };

  let jobs = $state<IndexedJob[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  let query = $state('');

  // Lazy-load on first open
  $effect(() => {
    if (globalActions.searchOpen && !loaded && !loading) {
      void load();
    }
  });

  async function load() {
    loading = true;
    try {
      // silent: search index failure shouldn't block the user from typing —
      // the empty-state UI below makes the failure obvious.
      const r = await api.get<{ jobs?: unknown[] }>('/api/search-index', { silent: true });
      jobs = Array.isArray(r.jobs) ? (r.jobs as typeof jobs) : [];
      loaded = true;
    } catch {
      jobs = [];
    } finally {
      loading = false;
    }
  }

  // Optional: command items by status section
  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Surface high-fit jobs when no query
      return [...jobs]
        .filter((j) => (j.score ?? 0) >= 4)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 20);
    }
    return jobs
      .filter((j) =>
        j.company.toLowerCase().includes(q) ||
        j.role.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q),
      )
      .slice(0, 30);
  });

  function selectJob(id: string) {
    globalActions.closeSearch();
    query = '';
    void goto('/job/' + id);
  }

  // Cmd/Ctrl+K to toggle
  onMount(() => {
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        globalActions.toggleSearch();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const STATUS_DOT: Record<string, string> = {
    New: 'bg-zinc-400',
    Scoring: 'bg-blue-400',
    Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400',
    Applied: 'bg-violet-400',
    Screened: 'bg-amber-400',
    Interview: 'bg-orange-400',
    Offer: 'bg-green-400',
    Rejected: 'bg-red-400',
    Closed: 'bg-zinc-500',
  };

  function scoreColor(s: number | null): string {
    if (s == null) return 'text-muted-foreground/50';
    if (s >= 4.5) return 'text-emerald-300';
    if (s >= 4) return 'text-emerald-400/80';
    if (s >= 3) return 'text-amber-400/80';
    return 'text-red-400/80';
  }
</script>

<Command.Dialog
  open={globalActions.searchOpen}
  onOpenChange={(v: boolean) => (globalActions.searchOpen = v)}
  shouldFilter={false}
  class="max-w-2xl"
>
  <Command.Input bind:value={query} placeholder="Search jobs by company, role, or location…" />
  <Command.List class="max-h-[420px]">
    {#if loading}
      <div class="px-4 py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-5 animate-spin" />
        <span>Loading job index…</span>
      </div>
    {:else if filtered.length === 0}
      <Command.Empty>
        {#if query.trim()}
          No jobs match "{query.trim()}".
        {:else if jobs.length === 0}
          No jobs in your pipeline yet — run a scan first.
        {:else}
          Type to search across {jobs.length.toLocaleString()} jobs.
        {/if}
      </Command.Empty>
    {:else}
      <Command.Group heading={query.trim() ? 'Matches (' + filtered.length + ')' : 'Top-scoring jobs'}>
        {#each filtered as j (j.id)}
          <Command.Item value={j.id + ' ' + j.company + ' ' + j.role} onSelect={() => selectJob(j.id)}>
            <div class={cn('size-1.5 rounded-full flex-shrink-0', STATUS_DOT[j.status] ?? 'bg-zinc-400')}></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium overflow-hidden whitespace-nowrap">{j.role}</span>
                {#if j.score != null}
                  <span class={cn('text-[11px] font-mono tabular-nums flex-shrink-0', scoreColor(j.score))}>
                    {j.score.toFixed(1)}
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <Briefcase class="size-3 flex-shrink-0" />
                <span class="overflow-hidden whitespace-nowrap">{j.company}</span>
                {#if j.location}
                  <span class="text-muted-foreground/40">·</span>
                  <span class="overflow-hidden whitespace-nowrap">{j.location}</span>
                {/if}
              </div>
            </div>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex-shrink-0">{j.status}</span>
            <ArrowRight class="size-3.5 text-muted-foreground/40 flex-shrink-0" />
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    <Command.Separator />
    <Command.Group heading="Quick actions">
      <Command.Item onSelect={() => { globalActions.closeSearch(); globalActions.openAddJob(); }}>
        <FileText class="size-4" />
        <span class="flex-1">Add a job by URL…</span>
        <span class="text-[10px] text-muted-foreground">N</span>
      </Command.Item>
      <Command.Item onSelect={() => { globalActions.closeSearch(); void goto('/inbox'); }}>
        <Paperclip class="size-4" />
        <span class="flex-1">Open Inbox</span>
      </Command.Item>
      <Command.Item onSelect={() => { globalActions.closeSearch(); void goto('/pipeline'); }}>
        <Search class="size-4" />
        <span class="flex-1">Open full Pipeline</span>
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
