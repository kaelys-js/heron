<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import {
    CircleDashed,
    Star,
    Folder,
    ShieldCheck,
    MapPin,
    Building2,
    Hash,
    ChevronDown,
    Check,
    ExternalLink,
    Wifi,
    Building,
    Globe,
    FileBadge2,
    FileText,
    Copy,
  } from '@lucide/svelte';
  import CheckMark from './CheckMark.svelte';
  import { toast } from 'svelte-sonner';
  import type { Job, Status, WorkMode } from '$lib/types';
  import { BG_TINTS, STATUS_ORDER } from '$lib/types';
  import { cn } from '$lib/utils';

  let { job, onStatusChange }: { job: Job; onStatusChange: (newStatus: string) => void } = $props();

  let copyState = $state<'idle' | 'copied'>('idle');
  async function copyUrl() {
    if (!job.url) return;
    try {
      await navigator.clipboard.writeText(job.url);
      copyState = 'copied';
      toast.success('URL copied');
      setTimeout(() => {
        copyState = 'idle';
      }, 1500);
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  let scoreClass = $derived(
    job.score == null
      ? 'bg-muted text-muted-foreground border-border'
      : job.score >= 4
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : job.score >= 3
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
          : 'bg-red-500/10 text-red-300 border-red-500/30',
  );

  // Defensive hostname parse — never crash the page over a malformed URL
  let hostname = $derived.by(() => {
    if (!job.url) return '';
    try {
      return new URL(job.url).hostname.replace(/^www\./, '');
    } catch {
      return job.url.length > 28 ? job.url.slice(0, 28) + '…' : job.url;
    }
  });

  const STATUS_DOTS: Record<Status, string> = {
    New: 'bg-zinc-400',
    Scoring: 'bg-blue-400',
    Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400',
    Queued: 'bg-fuchsia-400',
    Applying: 'bg-blue-400',
    Applied: 'bg-violet-400',
    Screened: 'bg-amber-400',
    PhoneScreen: 'bg-amber-300',
    Technical: 'bg-orange-400',
    TakeHome: 'bg-yellow-400',
    Onsite: 'bg-orange-500',
    Final: 'bg-red-400',
    Interview: 'bg-orange-400',
    Offer: 'bg-green-400',
    Negotiating: 'bg-lime-400',
    Accepted: 'bg-emerald-500',
    Declined: 'bg-zinc-400',
    Ghosted: 'bg-zinc-500',
    Rejected: 'bg-red-400',
    Closed: 'bg-zinc-500',
    ManualApplyNeeded: 'bg-amber-500',
  };
  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered',
    Scoring: 'Gemini is processing',
    Scored: 'Has a Gemini score',
    Ready: 'Eval done · CV PDF ready · go apply',
    Queued: 'Staged for batch send',
    Applying: 'Auto-apply running',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    PhoneScreen: 'Phone screen scheduled',
    Technical: 'Technical interview · algos / system design / coding',
    TakeHome: 'Take-home assignment in progress',
    Onsite: 'Onsite / panel loop',
    Final: 'Final round · hiring committee',
    Interview: 'Active interview process',
    Offer: 'Offer in hand',
    Negotiating: 'Counter-offer round(s) in progress',
    Accepted: 'You accepted the offer',
    Declined: 'You declined the offer',
    Ghosted: 'No response for ≥21 days',
    Rejected: 'Closed by company',
    Closed: 'Closed by you',
    ManualApplyNeeded: 'Auto-apply blocked — finish by hand',
  };

  // Work-mode visual + tip
  const WORK_MODE_UI: Record<WorkMode, { label: string; icon: any; tint: string; tip: string }> = {
    remote: {
      label: 'Remote',
      icon: Wifi,
      tint: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40',
      tip: 'Fully remote',
    },
    hybrid: {
      label: 'Hybrid',
      icon: Building,
      tint: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
      tip: 'Hybrid — some office presence required',
    },
    onsite: {
      label: 'On-site',
      icon: Building,
      tint: 'text-red-300 bg-red-500/10 border-red-500/40',
      tip: 'On-site — must work from a specific location',
    },
    unknown: {
      label: 'Unclear',
      icon: Globe,
      tint: 'text-muted-foreground bg-muted border-border/50',
      tip: 'Work mode not explicitly stated',
    },
  };
  let workModeUi = $derived(WORK_MODE_UI[job.workMode ?? 'unknown']);
  let WorkModeIcon = $derived(workModeUi.icon);

  // ---- Property labels with explanatory tooltips ----
  type PropDef = { key: string; label: string; icon: any; tip: string };
  const PROP_TIPS: Record<string, string> = {
    Status:
      'Current pipeline stage. Drives which column the job appears in and which actions are available.',
    Score:
      'Fit score (0–5). Above 4 means a deep Claude evaluation thinks you are a strong fit; ~ prefix means Gemini first-pass only.',
    'BG risk':
      'Background-check exposure. LOW = small startup unlikely to deeply screen; MEDIUM = standard US/Canadian Checkr; HIGH = SOX/FINRA-grade; BLOCKED = explicit clearance/no-record requirement.',
    Company: 'Company name extracted from the posting.',
    Location: 'Location requirement from the posting (city/region or "Remote").',
    'Work mode':
      'Whether the role is fully remote, hybrid, or on-site. Inferred from the posting; tooltip shows the raw text.',
    Source: 'The original job-posting URL. Click to open in a new tab.',
    Report: 'Filename of the Claude-generated deep-evaluation report (in reports/).',
    'CV PDF': 'A tailored CV PDF has been generated for this job (in output/).',
  };
</script>

<aside class="w-72 flex-shrink-0 border-l bg-muted/10 overflow-y-auto">
  <div class="p-4 space-y-4">
    <Tooltip.Provider delayDuration={350}>
      <!-- Quick actions toolbar — open the posting or copy the URL -->
      {#if job.url}
        <div class="flex items-center gap-1 -mx-1 -mt-1">
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <a
                  {...props}
                  href={job.url}
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] rounded-md border border-input hover:bg-accent transition-colors flex-1 min-w-0"
                >
                  <ExternalLink class="size-3 flex-shrink-0" />
                  <span class="truncate">Open posting</span>
                </a>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs">
              <span class="font-mono break-all">{job.url}</span>
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="icon"
                  class="size-7 flex-shrink-0"
                  aria-label="Copy URL"
                  onclick={copyUrl}
                >
                  {#if copyState === 'copied'}
                    <Check class="size-3 text-emerald-400" />
                  {:else}
                    <Copy class="size-3" />
                  {/if}
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs">
              {copyState === 'copied' ? 'Copied!' : 'Copy URL to clipboard'}
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      {/if}

      <!-- ===== Section: Status & fit ===== -->
      <div class="space-y-2">
        <h3
          class="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5"
        >
          <CircleDashed class="size-3" />
          Status &amp; fit
        </h3>
        <dl class="grid grid-cols-[88px_1fr] gap-y-2.5 gap-x-3 text-xs items-center">
          <!-- Status -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <CircleDashed class="size-3.5" />
                  <span>Status</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS.Status}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="sm"
                    class="h-7 px-2 text-xs w-full justify-between font-normal border-border/40"
                  >
                    <span class="flex items-center gap-1.5 min-w-0">
                      <span
                        class={cn(
                          'size-1.5 rounded-full flex-shrink-0',
                          STATUS_DOTS[job.status as Status],
                        )}
                      ></span>
                      <span class="truncate">{job.status}</span>
                    </span>
                    <ChevronDown class="size-3 text-muted-foreground flex-shrink-0" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content side="bottom" align="end" class="w-64">
                <DropdownMenu.Label
                  class="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >Change status</DropdownMenu.Label
                >
                {#each STATUS_ORDER as s}
                  <DropdownMenu.Item
                    onSelect={() => onStatusChange(s)}
                    closeOnSelect={false}
                    class="gap-2 items-start py-1.5"
                  >
                    <span class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', STATUS_DOTS[s])}
                    ></span>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-medium">{s}</div>
                      <div class="text-[10px] text-muted-foreground/70 leading-tight">
                        {STATUS_HINT[s]}
                      </div>
                    </div>
                    <CheckMark active={s === job.status} class="mt-0.5" />
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </dd>

          <!-- Score -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <Star class="size-3.5" />
                  <span>Score</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs">{PROP_TIPS.Score}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd>
            <span
              class={cn(
                'text-xs font-mono font-semibold border rounded px-2 py-0.5 inline-block',
                scoreClass,
              )}
            >
              {job.score != null
                ? job.score.toFixed(1)
                : job.geminiScore != null
                  ? '~' + job.geminiScore.toFixed(0)
                  : '—'}
            </span>
            {#if job.score == null && job.geminiScore != null}
              <span class="text-[10px] text-muted-foreground/60 ml-1">gemini</span>
            {/if}
          </dd>

          <!-- BG Risk -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <ShieldCheck class="size-3.5" />
                  <span>BG risk</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS['BG risk']}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd>
            {#if job.bgRisk}
              <Badge
                variant="outline"
                class={cn('text-[10px] uppercase font-mono h-5', BG_TINTS[job.bgRisk])}
                >{job.bgRisk}</Badge
              >
            {:else}
              <span class="text-muted-foreground/60">—</span>
            {/if}
          </dd>

          <!-- Work mode -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <WorkModeIcon class="size-3.5" />
                  <span>Work mode</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS['Work mode']}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd>
            {#if job.workMode && job.workMode !== 'unknown'}
              <Badge variant="outline" class={cn('text-[10px] h-5 font-medium', workModeUi.tint)}>
                {workModeUi.label}
              </Badge>
            {:else}
              <span class="text-muted-foreground/60">—</span>
            {/if}
          </dd>
        </dl>
      </div>

      <!-- ===== Section: Identity ===== -->
      <div class="space-y-2 pt-3 border-t border-border/30">
        <h3
          class="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5"
        >
          <Building2 class="size-3" />
          Identity
        </h3>
        <dl class="grid grid-cols-[88px_1fr] gap-y-2.5 gap-x-3 text-xs items-center">
          <!-- Company -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <Building2 class="size-3.5" />
                  <span>Company</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS.Company}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd class="truncate" title={job.company}>{job.company || '—'}</dd>

          <!-- Location -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <MapPin class="size-3.5" />
                  <span>Location</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS.Location}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd class="truncate text-muted-foreground" title={job.location}>{job.location || '—'}</dd>

          <!-- Source -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <dt {...props} class="text-muted-foreground flex items-center gap-1.5 cursor-help">
                  <Hash class="size-3.5" />
                  <span>Source</span>
                </dt>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" class="text-xs max-w-xs"
              >{PROP_TIPS.Source}</Tooltip.Content
            >
          </Tooltip.Root>
          <dd class="min-w-0">
            {#if job.url}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <a
                      {...props}
                      href={job.url}
                      target="_blank"
                      rel="noopener"
                      class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors max-w-full"
                    >
                      <span class="truncate font-mono text-[11px]">{hostname}</span>
                      <ExternalLink class="size-3 flex-shrink-0 opacity-60" />
                    </a>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="left" class="text-xs max-w-sm">
                  <span class="font-mono break-all">{job.url}</span>
                </Tooltip.Content>
              </Tooltip.Root>
            {:else}
              <span class="text-muted-foreground/60">—</span>
            {/if}
          </dd>
        </dl>
      </div>

      <!-- ===== Section: Files ===== -->
      {#if job.reportFile || job.pdfFile}
        <div class="space-y-2 pt-3 border-t border-border/30">
          <h3
            class="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileText class="size-3" />
            Files
          </h3>
          <dl class="grid grid-cols-[88px_1fr] gap-y-2.5 gap-x-3 text-xs items-center">
            {#if job.reportFile}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <dt
                      {...props}
                      class="text-muted-foreground flex items-center gap-1.5 cursor-help"
                    >
                      <FileText class="size-3.5" />
                      <span>Report</span>
                    </dt>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="left" class="text-xs max-w-xs"
                  >{PROP_TIPS.Report}</Tooltip.Content
                >
              </Tooltip.Root>
              <dd
                class="truncate font-mono text-[10px] text-muted-foreground"
                title={job.reportFile}
              >
                {job.reportFile}
              </dd>
            {/if}

            {#if job.pdfFile}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <dt
                      {...props}
                      class="text-muted-foreground flex items-center gap-1.5 cursor-help"
                    >
                      <FileBadge2 class="size-3.5" />
                      <span>CV PDF</span>
                    </dt>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="left" class="text-xs max-w-xs"
                  >{PROP_TIPS['CV PDF']}</Tooltip.Content
                >
              </Tooltip.Root>
              <dd class="text-emerald-400 inline-flex items-center gap-1">
                <Check class="size-3" />
                <span class="text-[11px]">generated</span>
              </dd>
            {/if}
          </dl>
        </div>
      {/if}
    </Tooltip.Provider>

    {#if job.notes}
      <div class="pt-3 border-t border-border/30">
        <h4
          class="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1.5"
        >
          Notes
        </h4>
        <p class="text-[11px] text-muted-foreground italic leading-relaxed">{job.notes}</p>
      </div>
    {/if}
  </div>
</aside>
