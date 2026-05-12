<script lang="ts">
  import { getContext } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { MapPin, FileText, FileBadge2, Wifi, Building, Globe, DollarSign } from '@lucide/svelte';
  import type { Job, WorkMode } from '$lib/types';
  import { BG_TINTS, APPLICATION_STATUS_TINTS } from '$lib/types';
  import { cn } from '$lib/utils';
  import JobActions from './JobActions.svelte';

  /**
   * Optional `activeProfileId` prop overrides the layout-context value (used
   * in tests). Normally the active profile id flows down via Svelte context
   * from `+layout.svelte` so every JobCard auto-decides whether to render
   * a "from profile" chip without per-callsite prop drilling.
   */
  let { job, activeProfileId }: { job: Job; activeProfileId?: string } = $props();
  const activeCtx = getContext<{ id: string | undefined } | undefined>('activeProfile');
  let resolvedActiveId = $derived(activeProfileId ?? activeCtx?.id);

  let showProfileBadge = $derived(
    job.profileId && resolvedActiveId && job.profileId !== resolvedActiveId,
  );

  function profileDot(): string {
    // Color is hashed from the profile slug for stable visual identity
    // without requiring the list view to know each profile's saved color.
    const slug = job.profileId ?? '';
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
    const colors = [
      'bg-blue-400',
      'bg-emerald-400',
      'bg-violet-400',
      'bg-amber-400',
      'bg-rose-400',
      'bg-cyan-400',
      'bg-orange-400',
      'bg-pink-400',
    ];
    return colors[Math.abs(h) % colors.length];
  }

  let displayScore = $derived(job.score ?? job.geminiScore);
  let isGemini = $derived(job.score == null && job.geminiScore != null);
  let scoreClass = $derived(
    displayScore == null
      ? 'bg-muted text-muted-foreground border-border'
      : displayScore >= 4.0
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : displayScore >= 3.0
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
          : 'bg-red-500/10 text-red-300 border-red-500/30',
  );
  let scoreVerdict = $derived.by(() => {
    if (displayScore == null) return 'Not yet scored';
    if (displayScore >= 4.5) return 'Strong fit · prioritize';
    if (displayScore >= 4) return 'Good fit · worth applying';
    if (displayScore >= 3) return 'Marginal · review the gaps';
    return 'Low fit · skip unless special interest';
  });
  let statusDotClass = $derived(
    job.status === 'Ready'
      ? 'bg-emerald-500'
      : job.status === 'Applied'
        ? 'bg-violet-500'
        : job.status === 'Interview'
          ? 'bg-orange-500'
          : job.status === 'Offer'
            ? 'bg-green-500'
            : job.status === 'Rejected'
              ? 'bg-red-500'
              : job.status === 'Scored'
                ? 'bg-cyan-500'
                : 'bg-zinc-500',
  );

  const WORK_MODE_UI: Record<WorkMode, { label: string; icon: any; tint: string; tip: string }> = {
    remote: {
      label: 'Remote',
      icon: Wifi,
      tint: 'text-emerald-300 border-emerald-500/40',
      tip: 'Fully remote',
    },
    hybrid: {
      label: 'Hybrid',
      icon: Building,
      tint: 'text-amber-300 border-amber-500/40',
      tip: 'Hybrid',
    },
    onsite: {
      label: 'On-site',
      icon: Building,
      tint: 'text-red-300 border-red-500/40',
      tip: 'On-site',
    },
    unknown: { label: '', icon: Globe, tint: '', tip: '' },
  };
  let workModeUi = $derived(
    job.workMode && job.workMode !== 'unknown' ? WORK_MODE_UI[job.workMode] : null,
  );
</script>

<!--
  Two siblings inside Card.Root:
    1. <a> wraps the data summary so the role/score/etc. area is a single click target
    2. JobActions row sits OUTSIDE the anchor so dropdown clicks never trigger
       navigation — even if the anchor swallowed the bubbled click
-->
<Card.Root
  class="bg-card hover:bg-accent/40 hover:border-accent/60 transition-colors p-0 gap-0 overflow-hidden"
>
  <a href={'/job/' + job.id} class="block group p-3 cursor-pointer">
    <Tooltip.Provider delayDuration={400}>
      <div class="flex items-start gap-2">
        <span class={cn('mt-1.5 size-1.5 rounded-full flex-shrink-0', statusDotClass)}></span>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <div
                    {...props}
                    class="text-sm font-medium leading-snug line-clamp-2 flex-1 cursor-help"
                  >
                    {job.role}
                  </div>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs max-w-sm">{job.role}</Tooltip.Content>
            </Tooltip.Root>
            {#if displayScore != null}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span
                      {...props}
                      class={cn(
                        'text-[10px] font-mono font-semibold border rounded px-1.5 py-0.5 flex-shrink-0 cursor-help',
                        scoreClass,
                      )}
                    >
                      {displayScore.toFixed(1)}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="left" class="text-xs max-w-xs">
                  <span class="font-medium">{displayScore.toFixed(1)} / 5</span> — {scoreVerdict}
                  {#if isGemini}<br /><span class="text-muted-foreground/80"
                      >Gemini first-pass · no deep eval yet</span
                    >{/if}
                </Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>
          <div class="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
            <span class="truncate">{job.company}</span>
            {#if showProfileBadge}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span
                      {...props}
                      class={cn(
                        'inline-flex items-center gap-1 rounded px-1 py-0.5 border border-border/40 bg-card/80 text-[9px] font-mono uppercase tracking-wider cursor-help',
                      )}
                    >
                      <span class={cn('size-1.5 rounded-full', profileDot())}></span>
                      {job.profileId}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs"
                  >From profile: {job.profileId}</Tooltip.Content
                >
              </Tooltip.Root>
            {/if}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap pl-3">
        {#if job.location}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <div
                  {...props}
                  class="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help"
                >
                  <MapPin class="size-2.5" />
                  <span class="truncate max-w-[150px]">{job.location}</span>
                </div>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="text-xs">Location: {job.location}</Tooltip.Content>
          </Tooltip.Root>
        {/if}

        {#if workModeUi}
          {@const WIcon = workModeUi.icon}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  class={cn(
                    'inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border font-medium',
                    workModeUi.tint,
                  )}
                >
                  <WIcon class="size-2.5" />
                  {workModeUi.label}
                </span>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="text-xs"
              >{workModeUi.tip} · click for details</Tooltip.Content
            >
          </Tooltip.Root>
        {/if}

        <!-- Salary chip is always rendered so the Board view never looks like it's missing the field -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span
                {...props}
                class={cn(
                  'inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border font-medium cursor-help',
                  job.salary
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300/90'
                    : 'bg-muted/40 border-border/40 text-muted-foreground/50',
                )}
              >
                <DollarSign class="size-2.5" />
                <span class="truncate max-w-[140px]">{job.salary || 'no salary'}</span>
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" class="text-xs max-w-xs">
            {job.salary ?? 'No salary range parsed from the posting'}
          </Tooltip.Content>
        </Tooltip.Root>

        {#if job.applicationStatus}
          {@const as = job.applicationStatus}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Badge
                  {...props}
                  variant="outline"
                  class={cn(
                    'text-[10px] h-4 px-1 font-mono uppercase border cursor-help',
                    APPLICATION_STATUS_TINTS[as],
                  )}
                >
                  {as}
                </Badge>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="text-xs max-w-xs">
              Application status from <code class="font-mono">applications.md</code> ({as}).
              Pipeline stage is shown separately as the colored dot.
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}

        {#if job.bgRisk}
          {@const bg = job.bgRisk}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Badge
                  {...props}
                  variant="outline"
                  class={cn(
                    'text-[10px] h-4 px-1 font-mono uppercase border cursor-help',
                    BG_TINTS[bg],
                  )}
                >
                  BG · {bg}
                </Badge>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="text-xs max-w-xs">
              Background-check risk: {bg}.
              {#if bg === 'BLOCKED'}Hard stop — explicit clearance/no-record requirement.
              {:else if bg === 'HIGH'}SOX/FINRA-grade — disclosure plan needed.
              {:else if bg === 'MEDIUM'}Standard Checkr-grade screen.
              {:else}Small startup, BG check unlikely or shallow.{/if}
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}

        <div class="ml-auto flex items-center gap-1.5">
          {#if job.reportFile}
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span
                    {...props}
                    class="inline-flex items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    <FileText class="size-3" />
                  </span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs"
                >Has deep evaluation report</Tooltip.Content
              >
            </Tooltip.Root>
          {/if}
          {#if job.pdfFile}
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span
                    {...props}
                    class="inline-flex items-center text-emerald-400/70 hover:text-emerald-300 transition-colors"
                  >
                    <FileBadge2 class="size-3" />
                  </span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">Tailored CV PDF generated</Tooltip.Content
              >
            </Tooltip.Root>
          {/if}
        </div>
      </div>
    </Tooltip.Provider>
  </a>

  <!--
    Action row — sibling of the navigation anchor, NOT nested inside it.
    JobActions still calls stopPropagation as defence in depth, but the real
    safety here is structural: the anchor doesn't wrap these buttons.
  -->
  <div class="flex items-center justify-end px-3 py-1.5 border-t border-border/30 bg-muted/10">
    <JobActions {job} size="card" align="end" />
  </div>
</Card.Root>
