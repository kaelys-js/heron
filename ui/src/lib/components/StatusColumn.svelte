<script lang="ts">
  import JobCard from './JobCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import ResponsiveActionMenu from './ResponsiveActionMenu.svelte';
  import ResponsiveActionItem from './ResponsiveActionItem.svelte';
  import ResponsiveActionLabel from './ResponsiveActionLabel.svelte';
  import { MoreHorizontal, Plus, ChevronDown } from '@lucide/svelte';
  import type { Job, Status } from '$lib/types';
  import { STATUS_EMPTY_COPY } from '$lib/types';
  import { cn } from '$lib/utils';
  import { api } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import EmptyState from './EmptyState.svelte';

  let {
    title,
    jobs = [],
    tint = '',
  }: {
    title: Status | string;
    jobs?: Job[];
    tint?: string;
  } = $props();

  const PAGE_SIZE = 25;
  let visibleCount = $state(PAGE_SIZE);

  // Reset pagination when the underlying job list shrinks below current view
  $effect(() => {
    if (jobs.length < visibleCount && visibleCount > PAGE_SIZE) {
      visibleCount = PAGE_SIZE;
    }
  });

  let displayed = $derived(jobs.slice(0, visibleCount));
  let hidden = $derived(Math.max(0, jobs.length - visibleCount));

  let addOpen = $state(false);
  let addUrl = $state('');
  let addCompany = $state('');
  let addRole = $state('');
  let adding = $state(false);

  const statusDotMap: Record<string, string> = {
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

  let emptyCopy = $derived(STATUS_EMPTY_COPY[title as Status] ?? 'Nothing here yet.');

  async function addManual() {
    if (!addUrl.trim() || adding) return;
    adding = true;
    try {
      await api.post(
        '/api/status',
        {
          url: addUrl.trim(),
          newStatus: title,
          notes:
            addCompany.trim() && addRole.trim() ? `${addCompany.trim()} · ${addRole.trim()}` : '',
        },
        {
          successToast: { title: 'Added', description: `${addCompany.trim() || 'Job'} → ${title}` },
        },
      );
      addOpen = false;
      addUrl = '';
      addCompany = '';
      addRole = '';
      await invalidateAll();
    } finally {
      adding = false;
    }
  }

  function showMore() {
    visibleCount = Math.min(jobs.length, visibleCount + PAGE_SIZE);
  }

  function showAll() {
    visibleCount = jobs.length;
  }

  function showLess() {
    visibleCount = PAGE_SIZE;
  }
</script>

<div class={cn('flex flex-col rounded-lg border bg-muted/20 min-h-[280px]', tint)}>
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
    <span class={cn('size-2 rounded-full', statusDotMap[title as string] ?? 'bg-zinc-400')}></span>
    <span class="text-sm font-medium">{title}</span>
    <span class="text-xs text-muted-foreground tabular-nums">{jobs.length}</span>
    <div class="ml-auto flex items-center gap-0.5">
      {#if jobs.length > PAGE_SIZE}
        <ResponsiveActionMenu
          title="{title} column"
          description="Manage how many jobs are visible in this column."
          align="end"
          desktopWidth="w-52"
          tooltipSide="bottom"
          tooltipDelay={250}
        >
          {#snippet trigger({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              aria-label="Column options"
            >
              <MoreHorizontal class="size-3" />
            </Button>
          {/snippet}
          {#snippet tooltip()}Show all / collapse{/snippet}
          {#snippet items()}
            <ResponsiveActionLabel>{title} · {jobs.length}</ResponsiveActionLabel>
            <ResponsiveActionItem onSelect={visibleCount >= jobs.length ? showLess : showAll}>
              {visibleCount >= jobs.length ? 'Collapse to ' + PAGE_SIZE : 'Show all ' + jobs.length}
            </ResponsiveActionItem>
          {/snippet}
        </ResponsiveActionMenu>
      {/if}
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="h-6 w-6"
                onclick={() => (addOpen = true)}
              >
                <Plus class="size-3" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs">Add job to {title}</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
    {#each displayed as job (job.id)}
      <JobCard {job} />
    {/each}
    {#if jobs.length === 0}
      <EmptyState size="sm" variant="inline" description={emptyCopy} />
    {/if}
    {#if hidden > 0}
      <button
        onclick={showMore}
        class="w-full mt-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border/40 hover:border-border transition-colors flex items-center justify-center gap-1.5"
      >
        <ChevronDown class="size-3" />
        <span>Show {Math.min(PAGE_SIZE, hidden)} more</span>
        <span class="text-muted-foreground/60 tabular-nums">·</span>
        <span class="text-muted-foreground/60 tabular-nums">{hidden} hidden</span>
      </button>
    {/if}
  </div>
</div>

<Dialog.Root bind:open={addOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Add job to {title}</Dialog.Title>
      <Dialog.Description>
        Paste a job URL. We'll track it under the <strong>{title}</strong> column.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3">
      <div class="space-y-1.5">
        <label for="add-url" class="text-xs font-medium"
          >URL <span class="text-destructive">*</span></label
        >
        <Input
          id="add-url"
          type="url"
          bind:value={addUrl}
          placeholder="https://..."
          class="font-mono text-sm"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="add-company" class="text-xs font-medium">Company</label>
          <Input id="add-company" bind:value={addCompany} placeholder="Acme Co" />
        </div>
        <div class="space-y-1.5">
          <label for="add-role" class="text-xs font-medium">Role</label>
          <Input id="add-role" bind:value={addRole} placeholder="Senior Engineer" />
        </div>
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button>
      <Button onclick={addManual} disabled={adding || !addUrl.trim()}>
        {adding ? 'Adding…' : 'Add to ' + title}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
