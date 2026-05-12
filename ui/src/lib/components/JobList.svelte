<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import { DollarSign, Wifi, Building, Globe, ScrollText, FileBadge2, Inbox } from '@lucide/svelte';
  import EmptyState from './EmptyState.svelte';
  import JobActions from './JobActions.svelte';
  import type { Job, WorkMode, Status } from '$lib/types';
  import { BG_TINTS, STATUS_TINTS } from '$lib/types';
  import { cn } from '$lib/utils';

  // Single grid template — header and rows must stay in lock-step.
  const GRID_TEMPLATE =
    '60px_minmax(220px,_3fr)_1fr_1fr_70px_70px_60px_minmax(140px,_1.2fr)_60px_100px';

  let { jobs, prevVisibleCount = 0 }: { jobs: Job[]; prevVisibleCount?: number } = $props();

  function scoreClass(s?: number) {
    if (s == null) return 'bg-muted text-muted-foreground border-border';
    if (s >= 4.5) return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40';
    if (s >= 4) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    if (s >= 3) return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    return 'bg-red-500/10 text-red-300 border-red-500/30';
  }
  function scoreVerdict(s?: number) {
    if (s == null) return 'Not yet scored';
    if (s >= 4.5) return 'Strong fit · prioritize';
    if (s >= 4) return 'Good fit · worth applying';
    if (s >= 3) return 'Marginal · review the gaps';
    return 'Low fit · skip unless special interest';
  }

  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote',
    Ready: 'Eval done · CV PDF ready · go apply',
    Queued: 'Staged for batch send · review on /queue',
    Applying: 'Autonomous-apply script running',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    PhoneScreen: 'Phone screen scheduled',
    Technical: 'Technical interview · algos / system design / coding',
    TakeHome: 'Take-home assignment in progress',
    Onsite: 'Onsite / panel loop',
    Final: 'Final round · hiring committee',
    Interview: 'Active interview process',
    Offer: 'Offer in hand · negotiate',
    Negotiating: 'Counter-offer round(s) in progress',
    Accepted: 'You accepted the offer',
    Declined: 'You declined the offer',
    Ghosted: 'Silent ≥21 days — auto-flagged',
    Rejected: 'Closed by company',
    Closed: 'You skipped this one',
    ManualApplyNeeded: 'Auto-apply blocked — finish by hand',
  };

  const WORK_MODE: Record<WorkMode, { label: string; icon: any; tint: string; tip: string }> = {
    remote: { label: 'Remote', icon: Wifi, tint: 'text-emerald-300', tip: 'Fully remote' },
    hybrid: {
      label: 'Hybrid',
      icon: Building,
      tint: 'text-amber-300',
      tip: 'Hybrid — some office presence required',
    },
    onsite: {
      label: 'On-site',
      icon: Building,
      tint: 'text-red-300',
      tip: 'On-site — must work from a specific location',
    },
    unknown: {
      label: '—',
      icon: Globe,
      tint: 'text-muted-foreground/50',
      tip: 'Work mode not stated in posting',
    },
  };
</script>

<div class="border rounded-lg overflow-hidden bg-muted/10">
  <Tooltip.Provider delayDuration={300}>
    <!-- Header — every column has a tooltip explaining what it represents -->
    <div
      class="grid grid-cols-[60px_minmax(220px,_3fr)_1fr_1fr_70px_70px_60px_minmax(140px,_1.2fr)_60px_100px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b font-medium bg-muted/20"
    >
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="text-right cursor-help">
              Score
            </div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs max-w-xs"
          >Fit score 0–5 (deep eval) · ~ Gemini first-pass</Tooltip.Content
        >
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Role</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">Job title from the posting</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Company</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">Hiring company name</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Location</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">Posting location requirement</Tooltip.Content
        >
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Status</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">Pipeline stage</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Mode</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs"
          >Remote / Hybrid / On-site (parsed from JD)</Tooltip.Content
        >
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">BG</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">Background-check risk tier</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="cursor-help">Salary</div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs"
          >Comp range from posting (when stated)</Tooltip.Content
        >
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="text-right cursor-help">
              Files
            </div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs"
          >Has report / Has tailored CV PDF</Tooltip.Content
        >
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}<div {...props} class="text-right cursor-help">
              Actions
            </div>{/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs"
          >Apply · change status · generate CV · more</Tooltip.Content
        >
      </Tooltip.Root>
    </div>

    {#each jobs as job, idx (job.id)}
      {@const score = job.score ?? job.geminiScore}
      {@const isGemini = job.score == null && job.geminiScore != null}
      {@const wm = WORK_MODE[job.workMode ?? 'unknown']}
      {@const WIcon = wm.icon}
      {@const isNew = idx >= prevVisibleCount}
      <!--
        Each row is a grid container. The anchor uses `contents` (CSS display:
        contents) so its children act as direct grid items; the actions cell
        is a sibling of the anchor — clicks inside it don't bubble to it.
      -->
      <div
        class={cn(
          'grid grid-cols-[60px_minmax(220px,_3fr)_1fr_1fr_70px_70px_60px_minmax(140px,_1.2fr)_60px_100px] gap-3 items-center px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/40 transition-colors group',
          isNew && 'animate-in fade-in slide-in-from-bottom-2 duration-300',
        )}
      >
        <a href={'/job/' + job.id} class="contents">
          <!-- Score (with tooltip showing verdict) -->
          <div class="text-right">
            {#if score != null}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span
                      {...props}
                      class={cn(
                        'text-[10px] font-mono font-semibold border rounded px-1.5 py-0.5 cursor-help',
                        scoreClass(score),
                      )}
                    >
                      {score.toFixed(1)}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs max-w-xs">
                  <span class="font-medium">{score.toFixed(1)} / 5</span> — {scoreVerdict(score)}
                  {#if isGemini}<br /><span class="text-muted-foreground/80"
                      >Gemini first-pass · no deep eval yet</span
                    >{/if}
                </Tooltip.Content>
              </Tooltip.Root>
            {:else}
              <span class="text-xs text-muted-foreground/50">—</span>
            {/if}
          </div>

          <!-- Role -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <div {...props} class="truncate font-medium cursor-help">{job.role}</div>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="text-xs max-w-md">{job.role}</Tooltip.Content>
          </Tooltip.Root>

          <!-- Company -->
          <div class="truncate text-muted-foreground">{job.company}</div>

          <!-- Location -->
          <div class="truncate text-xs text-muted-foreground/80" title={job.location}>
            {job.location || '—'}
          </div>

          <!-- Status -->
          <div>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Badge
                    {...props}
                    variant="outline"
                    class={cn(
                      'text-[10px] uppercase font-mono border cursor-help',
                      STATUS_TINTS[job.status],
                    )}>{job.status}</Badge
                  >
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs max-w-xs"
                >{STATUS_HINT[job.status]}</Tooltip.Content
              >
            </Tooltip.Root>
          </div>

          <!-- Work mode -->
          <div>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span
                    {...props}
                    class={cn('inline-flex items-center gap-1 text-[10px] cursor-help', wm.tint)}
                  >
                    <WIcon class="size-3" />
                    <span class="truncate">{wm.label}</span>
                  </span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">{wm.tip}</Tooltip.Content>
            </Tooltip.Root>
          </div>

          <!-- BG -->
          <div>
            {#if job.bgRisk}
              {@const bg = job.bgRisk}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Badge
                      {...props}
                      variant="outline"
                      class={cn('text-[10px] uppercase font-mono border cursor-help', BG_TINTS[bg])}
                      >{bg}</Badge
                    >
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs max-w-xs">
                  Background-check risk: {bg}.
                  {#if bg === 'BLOCKED'}Hard stop — clearance/no-record requirement.
                  {:else if bg === 'HIGH'}SOX/FINRA-grade — disclosure plan needed.
                  {:else if bg === 'MEDIUM'}Standard Checkr-grade screen.
                  {:else}Small startup, BG check unlikely or shallow.{/if}
                </Tooltip.Content>
              </Tooltip.Root>
            {:else}
              <span class="text-muted-foreground/40 text-xs">—</span>
            {/if}
          </div>

          <!-- Salary -->
          <div class="min-w-0">
            {#if job.salary}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span
                      {...props}
                      class="inline-flex items-center gap-0.5 text-[11px] text-emerald-400/85 cursor-help truncate max-w-full"
                    >
                      <DollarSign class="size-2.5 flex-shrink-0" />
                      <span class="truncate">{job.salary}</span>
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs max-w-xs">{job.salary}</Tooltip.Content>
              </Tooltip.Root>
            {:else}
              <span class="text-muted-foreground/40 text-xs">—</span>
            {/if}
          </div>

          <!-- Resources (with tooltips on each icon) -->
          <div class="flex items-center justify-end gap-1.5 text-muted-foreground/60">
            {#if job.reportFile}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span {...props}><ScrollText class="size-3" /></span>
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
                    <span {...props} class="text-emerald-400/70"><FileBadge2 class="size-3" /></span
                    >
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs"
                  >Tailored CV PDF generated</Tooltip.Content
                >
              </Tooltip.Root>
            {/if}
          </div>
        </a>

        <!-- Actions cell — SIBLING of the anchor (not nested) -->
        <div class="flex items-center justify-end">
          <JobActions {job} size="row" align="end" />
        </div>
      </div>
    {/each}
  </Tooltip.Provider>

  {#if jobs.length === 0}
    <EmptyState
      size="md"
      icon={Inbox}
      title="No jobs match"
      description="Try widening your filters or running a fresh scan."
    />
  {/if}
</div>
