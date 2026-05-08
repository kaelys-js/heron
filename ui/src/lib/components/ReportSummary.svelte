<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import {
    CheckCircle2, AlertTriangle, ShieldCheck, DollarSign, MapPin, Users, Wifi,
    Building, Globe, Plane, Layers, Briefcase, Trophy, Info,
  } from '@lucide/svelte';
  import type { ReportSummary, WorkMode } from '$lib/server/report-summary';
  import { BG_TINTS } from '$lib/types';
  import { cn } from '$lib/utils';
  import { cmd } from '$lib/config/branding';

  let { summary }: { summary: ReportSummary } = $props();

  let scoreClass = $derived.by(() => {
    if (summary.score == null) return 'border-border bg-muted text-muted-foreground';
    if (summary.score >= 4.5) return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200';
    if (summary.score >= 4) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    if (summary.score >= 3) return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    return 'border-red-500/40 bg-red-500/10 text-red-300';
  });

  let scoreVerdict = $derived.by(() => {
    if (summary.score == null) return { label: 'Unscored', desc: 'No deep evaluation yet — run ' + cmd('oferta') };
    if (summary.score >= 4.5) return { label: 'Strong fit', desc: 'Prioritize this one' };
    if (summary.score >= 4) return { label: 'Good fit', desc: 'Worth applying' };
    if (summary.score >= 3) return { label: 'Marginal', desc: 'Review the gaps before deciding' };
    return { label: 'Low fit', desc: 'Skip unless special interest' };
  });

  // Work mode UI mapping
  const WORK_MODE: Record<WorkMode, { label: string; icon: any; tint: string; tip: string }> = {
    remote: { label: 'Remote', icon: Wifi, tint: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40', tip: 'Fully remote — no required office presence' },
    hybrid: { label: 'Hybrid', icon: Building, tint: 'text-amber-300 bg-amber-500/10 border-amber-500/40', tip: 'Hybrid — some office presence required' },
    onsite: { label: 'On-site', icon: Building, tint: 'text-red-300 bg-red-500/10 border-red-500/40', tip: 'On-site — must work from a specific location' },
    unknown: { label: 'Mode unclear', icon: Globe, tint: 'text-muted-foreground bg-muted border-border/50', tip: 'Work mode not explicitly stated in posting' },
  };

  let isEmpty = $derived(
    summary.score == null &&
    !summary.archetype &&
    !summary.tldr &&
    summary.strongMatches.length === 0 &&
    summary.gaps.length === 0,
  );

  // Build the header chip set in priority order — only render chips with content
  type Chip = { icon: any; label: string; value: string; tip: string; tint?: string };
  let headerChips = $derived.by<Chip[]>(() => {
    const chips: Chip[] = [];
    if (summary.salary) {
      chips.push({
        icon: DollarSign,
        label: 'Comp',
        value: summary.salary,
        tip: 'Salary / total comp range from the posting',
        tint: 'text-emerald-300',
      });
    }
    const wm = WORK_MODE[summary.workMode];
    chips.push({
      icon: wm.icon,
      label: 'Work mode',
      value: wm.label,
      tip: summary.workModeRaw ? wm.tip + ' · "' + summary.workModeRaw + '"' : wm.tip,
      tint: wm.tint.split(' ')[0], // just the text color
    });
    if (summary.location) {
      chips.push({
        icon: MapPin,
        label: 'Location',
        value: summary.location,
        tip: 'Posting location requirement',
      });
    }
    if (summary.visa) {
      chips.push({
        icon: Plane,
        label: 'Visa',
        value: summary.visa,
        tip: 'Work authorization / sponsorship requirements',
      });
    }
    if (summary.bgRisk) {
      chips.push({
        icon: ShieldCheck,
        label: 'BG risk',
        value: summary.bgRisk,
        tip: summary.bgNote || 'Background-check exposure for this employer',
      });
    }
    return chips;
  });

  // Secondary facts (rendered as compact key/value rows)
  type Fact = { icon: any; label: string; value: string };
  let facts = $derived.by<Fact[]>(() => {
    const f: Fact[] = [];
    if (summary.companyStage) f.push({ icon: Trophy, label: 'Stage', value: summary.companyStage });
    if (summary.domain) f.push({ icon: Globe, label: 'Domain', value: summary.domain });
    if (summary.function) f.push({ icon: Briefcase, label: 'Function', value: summary.function });
    if (summary.seniority) f.push({ icon: Layers, label: 'Seniority', value: summary.seniority });
    if (summary.teamSize) f.push({ icon: Users, label: 'Team', value: summary.teamSize });
    if (summary.legitimacy) f.push({ icon: Info, label: 'Legitimacy', value: summary.legitimacy });
    return f;
  });
</script>

{#if !isEmpty}
  <Card.Root class={cn(
    'overflow-hidden',
    summary.score != null && summary.score >= 4 && 'border-l-2 border-l-emerald-500/60'
  )}>
    <Card.Content class="p-5 space-y-4">
      <!-- ROW 1: Score · Verdict -->
      <div class="flex items-stretch gap-4">
        {#if summary.score != null}
          <div class={cn('flex flex-col items-center justify-center px-3.5 py-2 rounded-lg border min-w-[64px]', scoreClass)}>
            <div class="text-2xl font-mono tabular-nums font-semibold leading-none">{summary.score.toFixed(1)}</div>
            <div class="text-[9px] uppercase tracking-wider opacity-70 mt-0.5">/ 5</div>
          </div>
        {/if}
        <div class="min-w-0 flex flex-col justify-center flex-1">
          <div class="text-base font-semibold leading-tight">{scoreVerdict.label}</div>
          <div class="text-xs text-muted-foreground mt-0.5">{scoreVerdict.desc}</div>
          {#if summary.archetype}
            <div class="text-[11px] text-muted-foreground/70 mt-1.5 inline-flex items-center gap-1">
              <Briefcase class="size-3" />
              {summary.archetype}
            </div>
          {/if}
        </div>
      </div>

      <!-- ROW 2: TL;DR full width -->
      {#if summary.tldr}
        <div class="rounded-md border border-border/40 bg-muted/30 px-4 py-3">
          <div class="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1.5">TL;DR</div>
          <p class="text-sm leading-relaxed">{summary.tldr}</p>
        </div>
      {/if}

      <!-- ROW 3: Headline chips (Comp · Work mode · Location · Visa · BG) -->
      {#if headerChips.length > 0}
        <Tooltip.Provider delayDuration={300}>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {#each headerChips as chip}
              {@const ChIcon = chip.icon}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <div {...props} class="flex flex-col gap-0.5 px-3 py-2 rounded-md border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors min-w-0">
                      <div class="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        <ChIcon class="size-3" />
                        {chip.label}
                      </div>
                      <div class={cn('text-xs font-medium truncate', chip.tint)}>
                        {#if chip.label === 'BG risk'}
                          <Badge variant="outline" class={cn('text-[10px] uppercase font-mono h-4 px-1', BG_TINTS[summary.bgRisk!])}>{chip.value}</Badge>
                        {:else}
                          {chip.value}
                        {/if}
                      </div>
                    </div>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                  <span class="font-medium">{chip.label}:</span> {chip.tip}
                </Tooltip.Content>
              </Tooltip.Root>
            {/each}
          </div>
        </Tooltip.Provider>
      {/if}

      <!-- ROW 4: Secondary facts inline (Stage · Domain · Function · Seniority · Team) -->
      {#if facts.length > 0}
        <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {#each facts as fact}
            {@const FIcon = fact.icon}
            <div class="inline-flex items-center gap-1.5">
              <FIcon class="size-3 text-muted-foreground/60" />
              <span class="text-muted-foreground/70">{fact.label}:</span>
              <span class="text-foreground/90">{fact.value}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ROW 5: Stack tags -->
      {#if summary.stack.length > 0}
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">Stack hits</span>
          {#each summary.stack as tech}
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">{tech}</span>
          {/each}
        </div>
      {/if}

      <!-- BG note (when present and non-trivial) -->
      {#if summary.bgNote}
        <div class="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-xs">
          <ShieldCheck class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p class="text-amber-200/90 leading-relaxed">{summary.bgNote}</p>
        </div>
      {/if}

      <!-- Strong matches + gaps (existing) -->
      {#if summary.strongMatches.length > 0 || summary.gaps.length > 0}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-border/40">
          {#if summary.strongMatches.length > 0}
            <div class="space-y-1.5">
              <div class="text-[10px] uppercase tracking-wider text-emerald-400/80 font-medium flex items-center gap-1.5">
                <CheckCircle2 class="size-3" />
                Why you fit
              </div>
              <ul class="space-y-1">
                {#each summary.strongMatches as m}
                  <li class="text-xs leading-relaxed flex items-start gap-1.5">
                    <span class="text-emerald-400/70 select-none flex-shrink-0">·</span>
                    <span class="text-foreground/90">{m.requirement}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if summary.gaps.length > 0}
            <div class="space-y-1.5">
              <div class="text-[10px] uppercase tracking-wider text-amber-400/80 font-medium flex items-center gap-1.5">
                <AlertTriangle class="size-3" />
                Gaps to address
              </div>
              <ul class="space-y-1">
                {#each summary.gaps as g}
                  <li class="text-xs leading-relaxed flex items-start gap-1.5">
                    <span class="text-amber-400/70 select-none flex-shrink-0">·</span>
                    <span class="text-foreground/90">{g.requirement}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
{/if}
