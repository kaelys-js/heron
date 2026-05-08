<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { MapPin, FileText, FileBadge2, Wifi, Building, Globe, DollarSign, ScrollText } from '@lucide/svelte';
  import type { Job, WorkMode, Status } from '$lib/types';
  import { BG_TINTS } from '$lib/types';
  import { cn } from '$lib/utils';
  import JobActions from './JobActions.svelte';

  /**
   * `hideCompany` removes the company column — used inside CompanyGroup
   * (where the section header already names the company). Frees up space
   * for the role to be more legible.
   */
  let { job, hideCompany = false }: { job: Job; hideCompany?: boolean } = $props();

  let displayScore = $derived(job.score ?? job.geminiScore);
  let isGemini = $derived(job.score == null && job.geminiScore != null);
  let scoreClass = $derived(
    displayScore == null ? 'text-muted-foreground/50'
    : displayScore >= 4.5 ? 'text-emerald-300'
    : displayScore >= 4   ? 'text-emerald-400/90'
    : displayScore >= 3   ? 'text-amber-400/90'
    : 'text-red-400/80'
  );
  let scoreVerdict = $derived.by(() => {
    if (displayScore == null) return 'Not yet scored';
    if (displayScore >= 4.5) return 'Strong fit · prioritize';
    if (displayScore >= 4)   return 'Good fit · worth applying';
    if (displayScore >= 3)   return 'Marginal · review the gaps';
    return 'Low fit · skip unless special interest';
  });
  let statusDotClass = $derived(
    job.status === 'Ready' ? 'bg-emerald-500'
    : job.status === 'Applied' ? 'bg-violet-500'
    : job.status === 'Interview' ? 'bg-orange-500'
    : job.status === 'Offer' ? 'bg-green-500'
    : job.status === 'Rejected' ? 'bg-red-500'
    : job.status === 'Scored' ? 'bg-cyan-500'
    : job.status === 'Scoring' ? 'bg-blue-500'
    : 'bg-zinc-500'
  );

  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote to Ready',
    Ready: 'Eval done · CV PDF ready · go apply',
    Queued: 'Staged for batch send · review on /queue',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    Interview: 'Active interview process',
    Offer: 'Offer in hand · negotiate',
    Rejected: 'Closed by company',
    Closed: 'You skipped this one',
  };

  const WORK_MODE: Record<WorkMode, { label: string; icon: any; tint: string; tip: string }> = {
    remote:  { label: 'Remote',  icon: Wifi,     tint: 'text-emerald-300', tip: 'Fully remote' },
    hybrid:  { label: 'Hybrid',  icon: Building, tint: 'text-amber-300',   tip: 'Hybrid — some office presence required' },
    onsite:  { label: 'On-site', icon: Building, tint: 'text-red-300',     tip: 'On-site — must work from a specific location' },
    unknown: { label: '—',       icon: Globe,    tint: 'text-muted-foreground/40', tip: 'Work mode not stated in posting' },
  };
  let wm = $derived(WORK_MODE[job.workMode ?? 'unknown']);
  let WIcon = $derived(wm.icon);
</script>

<!--
  Outer container is a div so JobActions (rightmost cell) is a sibling — not
  nested in the navigation anchor. The data-bearing cells live inside the
  anchor that wraps them as a flex child.
-->
<div
  class="group/row flex items-center gap-3 px-3 h-10 hover:bg-accent/40 transition-colors text-xs border-l-2 border-transparent hover:border-l-accent"
>
  <a
    href={'/job/' + job.id}
    class="flex items-center gap-3 flex-1 min-w-0"
  >
  <Tooltip.Provider delayDuration={400}>
    <!-- 1. Status dot (with tooltip explaining the state) -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span {...props} class={cn('size-1.5 rounded-full flex-shrink-0', statusDotClass)}></span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs max-w-xs">
        <span class="font-medium">{job.status}</span> · {STATUS_HINT[job.status]}
      </Tooltip.Content>
    </Tooltip.Root>

    <!-- 2. Score -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span {...props} class={cn('font-mono tabular-nums w-8 text-right flex-shrink-0 cursor-help', scoreClass)}>
            {displayScore != null ? displayScore.toFixed(1) : '—'}
          </span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs max-w-xs">
        {#if displayScore != null}
          <span class="font-medium">{displayScore.toFixed(1)} / 5</span> — {scoreVerdict}
          {#if isGemini}<br /><span class="text-muted-foreground/80">Gemini first-pass · no deep eval yet</span>{/if}
        {:else}
          Not yet scored
        {/if}
      </Tooltip.Content>
    </Tooltip.Root>

    <!-- 3. Role (flex) — tooltip shows full role when truncated -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span {...props} class="font-medium truncate flex-1 min-w-0 cursor-help">{job.role}</span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs max-w-sm">{job.role}</Tooltip.Content>
    </Tooltip.Root>

    {#if !hideCompany}
      <!-- 4. Company (w-40) -->
      <span class="text-muted-foreground truncate w-40 flex-shrink-0">{job.company || '—'}</span>
    {/if}

    <!-- 5. Location (w-36, always present with em-dash fallback) -->
    <span class="text-muted-foreground/80 inline-flex items-center gap-1 truncate w-36 flex-shrink-0">
      {#if job.location}
        <MapPin class="size-2.5 flex-shrink-0 text-muted-foreground/60" />
        <span class="truncate">{job.location}</span>
      {:else}
        <span class="text-muted-foreground/40">—</span>
      {/if}
    </span>

    <!-- 6. Work mode (w-20) -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span {...props} class={cn('inline-flex items-center gap-1 w-20 flex-shrink-0 truncate', wm.tint)}>
            <WIcon class="size-3 flex-shrink-0" />
            <span class="text-[10px] truncate">{wm.label}</span>
          </span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs">{wm.tip}</Tooltip.Content>
    </Tooltip.Root>

    <!-- 7. BG (w-14) -->
    <span class="w-14 flex-shrink-0 inline-flex justify-center">
      {#if job.bgRisk}
        {@const bg = job.bgRisk}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span {...props} class={cn('text-[9px] uppercase font-mono px-1 py-0 rounded border h-4 inline-flex items-center cursor-help', BG_TINTS[bg])}>
                {bg}
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" class="text-xs max-w-xs">
            Background-check risk: <span class="font-medium">{bg}</span>
          </Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <span class="text-muted-foreground/40 text-[10px]">—</span>
      {/if}
    </span>

    <!-- 8. Salary (w-32) -->
    <span class="w-32 flex-shrink-0 truncate">
      {#if job.salary}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span {...props} class="inline-flex items-center gap-0.5 text-[10px] text-emerald-400/85 cursor-help truncate">
                <DollarSign class="size-2.5 flex-shrink-0" />
                <span class="truncate">{job.salary}</span>
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" class="text-xs max-w-xs">{job.salary}</Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <span class="text-muted-foreground/40 text-[10px]">—</span>
      {/if}
    </span>

    <!-- 9. File indicators (w-12) — read-only state, last cell INSIDE the anchor -->
    <span class="w-12 flex-shrink-0 inline-flex items-center justify-end gap-1.5">
      {#if job.reportFile}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span {...props} class="text-muted-foreground/60 hover:text-foreground transition-colors">
                <ScrollText class="size-3" />
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" class="text-xs">Has deep evaluation report</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      {#if job.pdfFile}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span {...props} class="text-emerald-400/70 hover:text-emerald-300 transition-colors">
                <FileBadge2 class="size-3" />
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" class="text-xs">Tailored CV PDF generated</Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </span>
  </Tooltip.Provider>
  </a>

  <!--
    10. Actions — SIBLING of the anchor (not nested) so dropdown triggers
    don't bubble into a navigation event.
  -->
  <span class="w-24 flex-shrink-0 inline-flex justify-end">
    <JobActions {job} size="row" align="end" />
  </span>
</div>
