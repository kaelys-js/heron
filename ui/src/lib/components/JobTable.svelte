<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import { ChevronDown, ChevronUp, Wifi, Building, Globe, FileText, FileBadge2, ScrollText, Inbox } from '@lucide/svelte';
  import EmptyState from './EmptyState.svelte';
  import JobActions from './JobActions.svelte';
  import type { Job, WorkMode, Status } from '$lib/types';
  import { BG_TINTS } from '$lib/types';
  import { cn } from '$lib/utils';

  let { jobs = [], prevVisibleCount = 0 }: { jobs: Job[]; prevVisibleCount?: number } = $props();

  type SortField = 'score' | 'company' | 'role' | 'status' | 'location' | 'workMode' | 'bgRisk' | 'salary';
  let sortField = $state<SortField>('score');
  let sortDir = $state<'asc' | 'desc'>('desc');

  function toggleSort(f: SortField) {
    if (sortField === f) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = f;
      sortDir = f === 'score' ? 'desc' : 'asc';
    }
  }

  let sorted = $derived.by(() => {
    const arr = [...jobs];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      switch (sortField) {
        case 'score':
          av = a.score ?? a.geminiScore ?? -1;
          bv = b.score ?? b.geminiScore ?? -1;
          break;
        default:
          av = (a as any)[sortField] ?? '';
          bv = (b as any)[sortField] ?? '';
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  });

  const WORK_MODE: Record<WorkMode, { label: string; icon: any; tint: string }> = {
    remote:  { label: 'Remote',  icon: Wifi,     tint: 'text-emerald-300' },
    hybrid:  { label: 'Hybrid',  icon: Building, tint: 'text-amber-300' },
    onsite:  { label: 'On-site', icon: Building, tint: 'text-red-300' },
    unknown: { label: '—',       icon: Globe,    tint: 'text-muted-foreground/50' },
  };

  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing',
    Scored: 'Has a Gemini score',
    Ready: 'Eval done · CV PDF ready',
    Queued: 'Staged for batch send',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    Interview: 'Active interview',
    Offer: 'Offer in hand',
    Rejected: 'Closed by company',
    Closed: 'You skipped',
  };

  function statusDot(status: string): string {
    return status === 'Ready' ? 'bg-emerald-500'
      : status === 'Applied' ? 'bg-violet-500'
      : status === 'Interview' ? 'bg-orange-500'
      : status === 'Offer' ? 'bg-green-500'
      : status === 'Rejected' ? 'bg-red-500'
      : status === 'Scored' ? 'bg-cyan-500'
      : status === 'Scoring' ? 'bg-blue-500'
      : 'bg-zinc-500';
  }

  function scoreColor(s: number | null | undefined): string {
    if (s == null) return 'text-muted-foreground/50';
    if (s >= 4.5) return 'text-emerald-300';
    if (s >= 4)   return 'text-emerald-400/90';
    if (s >= 3)   return 'text-amber-400/90';
    return 'text-red-400/80';
  }

  type ColDef = { field: SortField; label: string; align?: 'left' | 'right'; class?: string; tip?: string };
  const COLS: ColDef[] = [
    { field: 'status',   label: 'Status',    class: 'w-28', tip: 'Pipeline stage — hover the dot for definition' },
    { field: 'score',    label: 'Score',     align: 'right', class: 'w-14', tip: 'Fit score 0–5 (deep eval), or ~ Gemini first-pass' },
    { field: 'role',     label: 'Role',      class: 'min-w-[260px]' },
    { field: 'company',  label: 'Company',   class: 'w-40' },
    { field: 'location', label: 'Location',  class: 'w-40' },
    { field: 'workMode', label: 'Work mode', class: 'w-28', tip: 'Remote / Hybrid / On-site (parsed from JD)' },
    { field: 'bgRisk',   label: 'BG',        class: 'w-16', tip: 'Background-check risk tier' },
    { field: 'salary',   label: 'Salary',    class: 'w-44', tip: 'Comp range from the posting (when stated)' },
  ];
</script>

<!--
  Bounded-height container so `sticky top-0` on the thead actually engages.
  100vh minus the topbar (~96px) + breathing room (~120px). Adjust calc if topbar height changes.
-->
<div class="rounded-md border border-border/40 overflow-hidden">
  <div class="max-h-[calc(100vh-220px)] overflow-auto relative">
    <table class="w-full text-xs border-collapse">
      <thead class="bg-muted/60 backdrop-blur-md text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
        <tr class="border-b border-border/40">
          <Tooltip.Provider delayDuration={300}>
            {#each COLS as c}
              <th class={cn('px-3 py-2 font-medium text-left whitespace-nowrap bg-muted/60 backdrop-blur-md', c.class, c.align === 'right' && 'text-right')}>
                {#if c.tip}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <button
                          {...props}
                          type="button"
                          onclick={() => toggleSort(c.field)}
                          class="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-help"
                        >
                          <span>{c.label}</span>
                          {#if sortField === c.field}
                            {#if sortDir === 'asc'}<ChevronUp class="size-3" />{:else}<ChevronDown class="size-3" />{/if}
                          {/if}
                        </button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs max-w-xs">{c.tip}</Tooltip.Content>
                  </Tooltip.Root>
                {:else}
                  <button
                    type="button"
                    onclick={() => toggleSort(c.field)}
                    class="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <span>{c.label}</span>
                    {#if sortField === c.field}
                      {#if sortDir === 'asc'}<ChevronUp class="size-3" />{:else}<ChevronDown class="size-3" />{/if}
                    {/if}
                  </button>
                {/if}
              </th>
            {/each}
            <th class="w-16 px-2 py-2 font-medium text-right whitespace-nowrap bg-muted/60 backdrop-blur-md">
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span {...props} class="cursor-help">Files</span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom" class="text-xs">Has report / Has tailored CV PDF</Tooltip.Content>
              </Tooltip.Root>
            </th>
            <th class="w-28 px-2 py-2 font-medium text-right whitespace-nowrap bg-muted/60 backdrop-blur-md">
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span {...props} class="cursor-help">Actions</span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom" class="text-xs">Apply · change status · generate CV</Tooltip.Content>
              </Tooltip.Root>
            </th>
          </Tooltip.Provider>
        </tr>
      </thead>
      <tbody>
        {#each sorted as job, idx (job.id)}
          {@const wm = WORK_MODE[job.workMode ?? 'unknown']}
          {@const WIcon = wm.icon}
          {@const score = job.score ?? job.geminiScore ?? null}
          {@const isNew = idx >= prevVisibleCount}
          <tr class={cn(
            'border-b border-border/30 hover:bg-accent/30 transition-colors group/row last:border-b-0',
            isNew && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
          )}>
            <!-- Status -->
            <td class="px-3 py-1.5 align-middle">
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <a {...props} href={'/job/' + job.id} class="inline-flex items-center gap-1.5">
                        <span class={cn('size-1.5 rounded-full flex-shrink-0', statusDot(job.status))}></span>
                        <span class="text-[11px] font-medium">{job.status}</span>
                      </a>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="right" class="text-xs max-w-xs">{STATUS_HINT[job.status]}</Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </td>
            <!-- Score -->
            <td class={cn('px-3 py-1.5 align-middle text-right font-mono tabular-nums', scoreColor(score))}>
              {score != null ? score.toFixed(1) : '—'}
            </td>
            <!-- Role -->
            <td class="px-3 py-1.5 align-middle">
              <a href={'/job/' + job.id} class="hover:text-foreground transition-colors">
                <span class="block truncate max-w-[460px]">{job.role}</span>
              </a>
            </td>
            <!-- Company -->
            <td class="px-3 py-1.5 align-middle text-muted-foreground truncate max-w-[160px]">{job.company}</td>
            <!-- Location -->
            <td class="px-3 py-1.5 align-middle text-muted-foreground/80 truncate max-w-[160px]">{job.location || '—'}</td>
            <!-- Work mode -->
            <td class="px-3 py-1.5 align-middle">
              <span class={cn('inline-flex items-center gap-1', wm.tint)}>
                <WIcon class="size-3" />
                <span class="text-[10px]">{wm.label}</span>
              </span>
            </td>
            <!-- BG -->
            <td class="px-3 py-1.5 align-middle">
              {#if job.bgRisk}
                <Badge variant="outline" class={cn('text-[10px] h-4 px-1 font-mono uppercase border', BG_TINTS[job.bgRisk])}>
                  {job.bgRisk}
                </Badge>
              {:else}
                <span class="text-muted-foreground/50">—</span>
              {/if}
            </td>
            <!-- Salary -->
            <td class="px-3 py-1.5 align-middle text-emerald-400/80 truncate max-w-[180px]">
              {#if job.salary}
                <Tooltip.Provider delayDuration={300}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <span {...props} class="cursor-help">{job.salary}</span>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="top" class="text-xs max-w-xs">{job.salary}</Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              {:else}
                <span class="text-muted-foreground/50">—</span>
              {/if}
            </td>
            <!-- icons (report/pdf) -->
            <td class="px-2 py-1.5 align-middle text-right">
              <Tooltip.Provider delayDuration={300}>
                <span class="inline-flex items-center gap-1.5 text-muted-foreground/50">
                  {#if job.reportFile}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}<span {...props}><ScrollText class="size-3" /></span>{/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="top" class="text-xs">Has deep evaluation report</Tooltip.Content>
                    </Tooltip.Root>
                  {/if}
                  {#if job.pdfFile}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}<span {...props} class="text-emerald-400/60"><FileBadge2 class="size-3" /></span>{/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="top" class="text-xs">Tailored CV PDF generated</Tooltip.Content>
                    </Tooltip.Root>
                  {/if}
                </span>
              </Tooltip.Provider>
            </td>
            <!-- Actions -->
            <td class="px-2 py-1.5 align-middle text-right">
              <div class="inline-flex justify-end">
                <JobActions {job} size="row" align="end" />
              </div>
            </td>
          </tr>
        {/each}
        {#if sorted.length === 0}
          <tr>
            <td colspan="10" class="p-0">
              <EmptyState
                size="md"
                variant="inline"
                icon={Inbox}
                title="No jobs match"
                description="Try widening your filters or running a fresh scan."
              />
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
