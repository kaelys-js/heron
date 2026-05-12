<script lang="ts">
  import { ChevronDown, Building2 } from '@lucide/svelte';
  import JobRowCompact from './JobRowCompact.svelte';
  import type { Job } from '$lib/types';
  import { cn } from '$lib/utils';

  let {
    company,
    jobs,
    /** Whether to default this group as expanded. Off by default (user requested collapsed). */
    defaultOpen = false,
  }: { company: string; jobs: Job[]; defaultOpen?: boolean } = $props();

  // svelte-ignore state_referenced_locally — initial seed only
  let open = $state(defaultOpen);

  // Aggregate stats for the section header
  let stats = $derived.by(() => {
    let scored = 0;
    let ready = 0;
    let applied = 0;
    let interview = 0;
    let topScore: number | null = null;
    for (const j of jobs) {
      const s = j.score ?? j.geminiScore ?? null;
      if (s != null && (topScore == null || s > topScore)) topScore = s;
      if (j.score != null) scored++;
      if (j.status === 'Ready') ready++;
      if (j.status === 'Applied' || j.status === 'Screened') applied++;
      if (j.status === 'Interview' || j.status === 'Offer') interview++;
    }
    return { scored, ready, applied, interview, topScore };
  });

  let topScoreClass = $derived.by(() => {
    if (stats.topScore == null) return 'text-muted-foreground/50';
    if (stats.topScore >= 4.5) return 'text-emerald-300';
    if (stats.topScore >= 4) return 'text-emerald-400/90';
    if (stats.topScore >= 3) return 'text-amber-400/90';
    return 'text-red-400/80';
  });
</script>

<section class="rounded-md border border-border/40 bg-card overflow-hidden">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="w-full flex items-center gap-3 px-3 h-10 hover:bg-muted/40 transition-colors text-left"
  >
    <ChevronDown
      class={cn(
        'size-3.5 text-muted-foreground transition-transform flex-shrink-0',
        !open && '-rotate-90',
      )}
    />
    <Building2 class="size-3.5 text-muted-foreground/70 flex-shrink-0" />
    <span class="text-sm font-medium truncate flex-1 min-w-0">{company}</span>

    <!-- Quick stats row -->
    <div class="flex items-center gap-3 text-[10px] text-muted-foreground/80 flex-shrink-0">
      <span class="tabular-nums">
        <span class="text-foreground font-medium">{jobs.length}</span>
        {jobs.length === 1 ? 'role' : 'roles'}
      </span>
      {#if stats.topScore != null}
        <span class="inline-flex items-center gap-1">
          <span class="text-muted-foreground/60">top</span>
          <span class={cn('font-mono tabular-nums', topScoreClass)}
            >{stats.topScore.toFixed(1)}</span
          >
        </span>
      {/if}
      {#if stats.ready > 0}
        <span class="text-emerald-400/80 tabular-nums">{stats.ready} ready</span>
      {/if}
      {#if stats.applied > 0}
        <span class="text-violet-400/80 tabular-nums">{stats.applied} applied</span>
      {/if}
      {#if stats.interview > 0}
        <span class="text-orange-400/80 tabular-nums">{stats.interview} interviewing</span>
      {/if}
    </div>
  </button>

  <!-- Animated content via grid-template-rows trick -->
  <div
    class={cn(
      'grid transition-[grid-template-rows] duration-200 ease-out',
      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    )}
  >
    <div class={cn('overflow-hidden min-h-0', !open && 'pointer-events-none')}>
      <div class="border-t border-border/40">
        <!-- Header for the rows inside this group (matches JobRowCompact column widths, minus Company) -->
        <div
          class="flex items-center gap-3 px-3 h-7 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/30 bg-muted/20 border-l-2 border-l-transparent"
        >
          <span class="size-1.5 flex-shrink-0"></span>
          <span class="w-8 flex-shrink-0 text-right">Score</span>
          <span class="flex-1 min-w-0">Role</span>
          <span class="w-36 flex-shrink-0">Location</span>
          <span class="w-20 flex-shrink-0">Mode</span>
          <span class="w-14 flex-shrink-0 text-center">BG</span>
          <span class="w-32 flex-shrink-0">Salary</span>
          <span class="w-12 flex-shrink-0 text-right">·</span>
          <span class="w-24 flex-shrink-0 text-right">Actions</span>
        </div>
        <div class="divide-y divide-border/20">
          {#each jobs as job (job.id)}
            <JobRowCompact {job} hideCompany={true} />
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
