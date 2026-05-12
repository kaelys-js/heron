<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import {
    Lightbulb,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Target,
    Building2,
    Globe,
    Loader2,
    Sparkles,
    Activity,
    CheckCircle2,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { withMinDuration, cn } from '$lib/utils';
  import type {
    PatternsResult,
    Recommendation,
    ArchetypeRow,
    RemotePolicyRow,
    CompanySizeRow,
  } from '$lib/server/analyze-patterns';

  let { data }: { data: { patterns: PatternsResult | null; loadError: string | null } } = $props();

  let refreshing = $state(false);
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await withMinDuration(api.get('/api/insights/patterns?fresh=1', { silent: true }), 600);
      await invalidateAll();
      toast.success('Insights refreshed', {
        description: 'Latest data pulled from applications.md and reports/.',
      });
    } catch (e) {
      const err = e as ApiError;
      toast.error('Refresh failed', {
        description: err.message,
        action: { label: 'Retry', onClick: () => refresh() },
      });
    } finally {
      refreshing = false;
    }
  }

  let p = $derived(data.patterns);
  let total = $derived(p?.metadata?.total ?? 0);
  let outcomes = $derived(p?.metadata?.byOutcome);
  let finishedOutcomes = $derived(
    (outcomes?.positive ?? 0) + (outcomes?.negative ?? 0) + (outcomes?.self_filtered ?? 0),
  );

  // ---- Subtitle / date range — guard against missing dates ----
  let dateRangeLabel = $derived.by(() => {
    const m = p?.metadata;
    if (!m) return '';
    const from = m.dateRange?.from;
    const to = m.dateRange?.to;
    if (!from && !to) return m.total + ' apps';
    if (from && to && from !== to) return m.total + ' apps · ' + from + ' → ' + to;
    return m.total + ' apps · ' + (from ?? to ?? '');
  });

  // ---- Sorted views over the array shapes the script returns ----
  let archetypeRows = $derived<ArchetypeRow[]>(
    (p?.archetypeBreakdown ?? []).slice().sort((a, b) => b.total - a.total),
  );
  let remoteRows = $derived<RemotePolicyRow[]>(
    (p?.remotePolicy ?? []).slice().sort((a, b) => b.total - a.total),
  );
  let companySizeRows = $derived<CompanySizeRow[]>(
    (p?.companySizeBreakdown ?? []).slice().sort((a, b) => b.total - a.total),
  );

  // ---- Funnel — order known stage names first, then anything else by count desc ----
  // Script's funnel mixes status labels (evaluated, skip, discarded) with score
  // buckets (4.3, 3.5/5, etc); show the recognised statuses first so the chart
  // reads as a real funnel, then dump the rest.
  const KNOWN_STAGES = [
    'evaluated',
    'skip',
    'pending',
    'applied',
    'screened',
    'interview',
    'offer',
    'rejected',
    'discarded',
  ];
  let funnelRows = $derived.by(() => {
    const f = p?.funnel ?? {};
    const entries = Object.entries(f);
    const known = KNOWN_STAGES.map((k) => [k, f[k] ?? 0] as const).filter(([, v]) => v > 0);
    const others = entries.filter(([k]) => !KNOWN_STAGES.includes(k)).sort((a, b) => b[1] - a[1]);
    return [...known, ...others];
  });
  let funnelTotal = $derived(funnelRows.reduce((acc, [, v]) => acc + v, 0));

  // ---- Formatting helpers — defensive against missing fields ----
  /** conversionRate from script is already 0-100 (integer). NEVER multiply
   *  it by 100 again. Returns "0%" when undefined/NaN to avoid "NaN%". */
  function fmtRate(r: number | undefined | null): string {
    if (typeof r !== 'number' || !Number.isFinite(r)) return '0%';
    return Math.round(r) + '%';
  }
  /** Bar width as a 0-100 percentage from a 0-100 conversion rate. Defensive. */
  function rateWidth(r: number | undefined | null): number {
    if (typeof r !== 'number' || !Number.isFinite(r)) return 0;
    return Math.max(0, Math.min(100, r));
  }
  function fmtScore(n: number | undefined | null): string {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '–';
    return n.toFixed(1);
  }
  function fmtCount(n: number | undefined | null): string {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
    return n.toLocaleString();
  }
  /** Tint a conversion rate (0-100) — green at high, amber middling, red low. */
  function rateTint(r: number): string {
    if (r >= 30) return 'bg-emerald-500/40';
    if (r >= 15) return 'bg-amber-500/40';
    if (r > 0) return 'bg-red-500/40';
    return 'bg-zinc-500/30';
  }
  function impactBadge(impact: Recommendation['impact']): string {
    if (impact === 'high') return 'bg-red-500/15 text-red-300 border-red-500/40';
    if (impact === 'medium') return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40';
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Insights"
    subtitle={dateRangeLabel || undefined}
    showTabs={false}
    showFilter={true}
  />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">
      <!-- ===================== HERO ===================== -->
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1.5 max-w-3xl">
          <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Lightbulb class="size-5 text-amber-400" />
            Patterns &amp; recommendations
          </h1>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Looks at every application in your tracker plus every deep-evaluation report you've
            generated, then reports back where you're winning, where the system is wasting your
            effort, and what to change. The answers get more reliable the more <em>finished</em> outcomes
            you have — applications still in "Applied" don't count yet.
          </p>
        </div>
        <Button onclick={refresh} disabled={refreshing} class="gap-1.5 flex-shrink-0">
          {#if refreshing}<Loader2 class="size-3.5 animate-spin" /> Recomputing…{:else}<RefreshCw
              class="size-3.5"
            /> Refresh{/if}
        </Button>
      </div>

      {#if data.loadError}
        <ErrorState
          size="md"
          title="Couldn't load patterns"
          error={data.loadError}
          onretry={refresh}
        />
      {:else if !p || total === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={Lightbulb}
          title="No applications tracked yet"
          description="Once you've applied to a handful of jobs and captured outcomes (Applied, Screened, Interview, Offer, Rejected, or SKIP), this page will start to show patterns. The numbers get reliable around 10 finished outcomes."
        />
      {:else if finishedOutcomes < 5}
        <EmptyState
          size="lg"
          variant="card"
          icon={Lightbulb}
          title="Not enough finished outcomes yet"
          description={'You have ' +
            total +
            ' applications tracked but only ' +
            finishedOutcomes +
            " have a final outcome (Rejected, Interview/Offer, or SKIP). Patterns need at least 5 finished outcomes — preferably 10+ — before they're trustworthy."}
        />
      {:else}
        <!-- ===================== OUTCOME SNAPSHOT ===================== -->
        {#if outcomes}
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <Activity class="size-3.5 text-muted-foreground" />
                Outcome snapshot
              </Card.Title>
              <Card.Description class="text-xs">
                How your {fmtCount(total)} applications break down today. "Self-filtered" = SKIP rows
                you discarded before applying; "Pending" = no final answer yet.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
                  <div
                    class="text-[11px] uppercase tracking-wider text-emerald-300/80 flex items-center gap-1"
                  >
                    <CheckCircle2 class="size-3" /> Positive
                  </div>
                  <div class="text-lg font-semibold tabular-nums text-emerald-200 mt-0.5">
                    {fmtCount(outcomes.positive)}
                  </div>
                  <div class="text-[11px] text-muted-foreground">Screened · Interview · Offer</div>
                </div>
                <div class="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5">
                  <div class="text-[11px] uppercase tracking-wider text-red-300/80">Negative</div>
                  <div class="text-lg font-semibold tabular-nums text-red-200 mt-0.5">
                    {fmtCount(outcomes.negative)}
                  </div>
                  <div class="text-[11px] text-muted-foreground">Rejected after review</div>
                </div>
                <div class="rounded-md border border-zinc-500/30 bg-zinc-500/5 px-3 py-2.5">
                  <div class="text-[11px] uppercase tracking-wider text-zinc-300/80">
                    Self-filtered
                  </div>
                  <div class="text-lg font-semibold tabular-nums text-zinc-200 mt-0.5">
                    {fmtCount(outcomes.self_filtered)}
                  </div>
                  <div class="text-[11px] text-muted-foreground">Marked SKIP — never applied</div>
                </div>
                <div class="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
                  <div class="text-[11px] uppercase tracking-wider text-blue-300/80">Pending</div>
                  <div class="text-lg font-semibold tabular-nums text-blue-200 mt-0.5">
                    {fmtCount(outcomes.pending)}
                  </div>
                  <div class="text-[11px] text-muted-foreground">Applied — no answer yet</div>
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        {/if}

        <!-- ===================== TOP RECOMMENDATIONS ===================== -->
        {#if p.recommendations && p.recommendations.length > 0}
          <Card.Root class="border-amber-500/40 bg-amber-500/5">
            <Card.Header class="pb-3">
              <Card.Title class="text-sm flex items-center gap-2">
                <Sparkles class="size-4 text-amber-400" />
                Recommendations
              </Card.Title>
              <Card.Description class="text-xs">
                Concrete actions auto-derived from your conversion data. Each one cites the evidence
                — sanity-check the reasoning before you change a filter or mode.
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-2.5">
              {#each p.recommendations as rec, i (i)}
                <div
                  class="rounded-md border border-amber-500/20 bg-background/40 px-3 py-2.5 space-y-1"
                >
                  <div class="flex items-start justify-between gap-3">
                    <p class="text-xs font-medium leading-relaxed flex-1">{rec.action}</p>
                    <span
                      class={cn(
                        'text-[11px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border flex-shrink-0',
                        impactBadge(rec.impact),
                      )}>{rec.impact}</span
                    >
                  </div>
                  {#if rec.reasoning}
                    <p class="text-[11px] text-muted-foreground leading-relaxed">{rec.reasoning}</p>
                  {/if}
                </div>
              {/each}
            </Card.Content>
          </Card.Root>
        {/if}

        <!-- ===================== FUNNEL + SCORE-VS-OUTCOME ===================== -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <Target class="size-3.5 text-muted-foreground" />
                Conversion funnel
              </Card.Title>
              <Card.Description class="text-xs">
                Counts at each stage of your tracker. Wide bars at the top, narrow bars at the
                bottom is the normal shape — a wide "evaluated" with no movement past it is a sign
                the funnel is leaking.
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-1.5">
              {#each funnelRows as [stage, count]}
                {@const w =
                  funnelTotal > 0 ? Math.max(0, Math.min(100, (count / funnelTotal) * 100)) : 0}
                <div class="flex items-center gap-3 text-xs">
                  <div class="w-28 shrink-0 text-muted-foreground capitalize">{stage}</div>
                  <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div
                      class="absolute inset-y-0 left-0 bg-primary/40"
                      style={'width: ' + w + '%'}
                    ></div>
                  </div>
                  <div class="w-12 text-right tabular-nums font-medium">{fmtCount(count)}</div>
                </div>
              {/each}
              {#if funnelRows.length === 0}
                <p class="text-xs text-muted-foreground italic">No outcomes recorded yet.</p>
              {/if}
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <TrendingUp class="size-3.5 text-muted-foreground" />
                Score vs outcome
              </Card.Title>
              <Card.Description class="text-xs">
                Average fit score (Bloque A in each report, 0–5) grouped by what eventually
                happened. If "positive" averages much higher than "negative", your scoring is
                calibrated; if not, the threshold below has more weight.
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-1.5">
              {#each Object.entries(p.scoreComparison ?? {}) as [group, stats]}
                {@const tint =
                  group === 'positive'
                    ? 'text-emerald-300'
                    : group === 'negative'
                      ? 'text-red-300'
                      : 'text-muted-foreground'}
                <div class="flex items-center gap-3 text-xs">
                  <div class="w-24 shrink-0 capitalize {tint}">{group.replace('_', ' ')}</div>
                  <div class="flex-1 font-mono tabular-nums">
                    {#if stats.count > 0}
                      avg {fmtScore(stats.avg)} · range {fmtScore(stats.min)}–{fmtScore(stats.max)}
                    {:else}
                      <span class="text-muted-foreground italic">no data</span>
                    {/if}
                  </div>
                  <div class="w-12 text-right text-muted-foreground tabular-nums">
                    n={fmtCount(stats.count)}
                  </div>
                </div>
              {/each}
              {#if p.scoreThreshold}
                <div
                  class="pt-2 mt-2 border-t border-border/40 text-[11px] text-muted-foreground leading-relaxed"
                >
                  <span class="text-amber-300 font-medium">Suggested score floor:</span>
                  {fmtScore(p.scoreThreshold.recommended)}/5
                  {#if p.scoreThreshold.positiveRange && p.scoreThreshold.positiveRange !== 'N/A'}
                    · positive range {p.scoreThreshold.positiveRange}
                  {/if}
                  <p class="mt-1 text-muted-foreground/80">{p.scoreThreshold.reasoning}</p>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>

        <!-- ===================== ARCHETYPE BREAKDOWN ===================== -->
        {#if archetypeRows.length > 0}
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <Sparkles class="size-3.5 text-muted-foreground" />
                Archetype breakdown
              </Card.Title>
              <Card.Description class="text-xs">
                Conversion rate per archetype (positive ÷ total). Apply more in green rows, less in
                red rows. "Unknown" rows are JDs we couldn't classify — usually a sign the report's
                Block A wasn't filled in.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <Tooltip.Provider delayDuration={300}>
                <div class="space-y-1">
                  {#each archetypeRows as row (row.archetype)}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <div {...props} class="flex items-center gap-3 text-xs cursor-help">
                            <div class="w-32 shrink-0 truncate" title={row.archetype}>
                              {row.archetype}
                            </div>
                            <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                              <div
                                class={cn(
                                  'absolute inset-y-0 left-0',
                                  rateTint(row.conversionRate),
                                )}
                                style={'width: ' + rateWidth(row.conversionRate) + '%'}
                              ></div>
                            </div>
                            <div class="w-14 text-right tabular-nums">
                              {fmtRate(row.conversionRate)}
                            </div>
                            <div class="w-12 text-right text-muted-foreground tabular-nums">
                              n={fmtCount(row.total)}
                            </div>
                          </div>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="top" class="text-xs max-w-xs">
                        <div class="font-medium mb-1">{row.archetype}</div>
                        <div class="text-muted-foreground">
                          {fmtCount(row.positive)} positive · {fmtCount(row.negative)} rejected ·
                          {fmtCount(row.self_filtered)} self-filtered ·
                          {fmtCount(row.pending)} pending
                        </div>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  {/each}
                </div>
              </Tooltip.Provider>
            </Card.Content>
          </Card.Root>
        {/if}

        <!-- ===================== REMOTE POLICY + COMPANY SIZE ===================== -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {#if remoteRows.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <Globe class="size-3.5 text-muted-foreground" />
                  Remote policy
                </Card.Title>
                <Card.Description class="text-xs">
                  Conversion rate per work-mode. If "hybrid/onsite" sits at 0% across many apps,
                  that's a filter the system should be applying for you in <code
                    class="font-mono text-foreground/80">portals.yml</code
                  >.
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1">
                {#each remoteRows as row (row.policy)}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="w-28 shrink-0 truncate capitalize" title={row.policy}>
                      {row.policy}
                    </div>
                    <div class="flex-1 relative h-4 rounded bg-muted/30 overflow-hidden">
                      <div
                        class={cn('absolute inset-y-0 left-0', rateTint(row.conversionRate))}
                        style={'width: ' + rateWidth(row.conversionRate) + '%'}
                      ></div>
                    </div>
                    <div class="w-12 text-right tabular-nums">{fmtRate(row.conversionRate)}</div>
                    <div class="w-10 text-right text-muted-foreground tabular-nums">
                      n={fmtCount(row.total)}
                    </div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}

          {#if companySizeRows.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <Building2 class="size-3.5 text-muted-foreground" />
                  Company stage
                </Card.Title>
                <Card.Description class="text-xs">
                  Conversion split by company stage / headcount band. Big differences here argue for
                  narrowing the targeting in your archetype, not just the keywords.
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1">
                {#each companySizeRows as row (row.size)}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="w-28 shrink-0 truncate capitalize" title={row.size}>{row.size}</div>
                    <div class="flex-1 relative h-4 rounded bg-muted/30 overflow-hidden">
                      <div
                        class={cn('absolute inset-y-0 left-0', rateTint(row.conversionRate))}
                        style={'width: ' + rateWidth(row.conversionRate) + '%'}
                      ></div>
                    </div>
                    <div class="w-12 text-right tabular-nums">{fmtRate(row.conversionRate)}</div>
                    <div class="w-10 text-right text-muted-foreground tabular-nums">
                      n={fmtCount(row.total)}
                    </div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

        <!-- ===================== TOP BLOCKERS + TECH GAPS ===================== -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {#if p.blockerAnalysis && p.blockerAnalysis.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <AlertTriangle class="size-3.5 text-red-400" />
                  Top blockers
                </Card.Title>
                <Card.Description class="text-xs">
                  Reasons cited in the gaps section of your evaluations. High-frequency blockers are
                  the filters worth tightening upstream so they don't burn evaluation tokens.
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1.5">
                {#each p.blockerAnalysis.slice(0, 8) as b (b.blocker)}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="flex-1 min-w-0 truncate" title={b.blocker}>{b.blocker}</div>
                    <div class="font-mono tabular-nums text-muted-foreground">
                      {fmtCount(b.frequency)}× · {fmtRate(b.percentage)}
                    </div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}

          {#if p.techStackGaps && p.techStackGaps.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <TrendingDown class="size-3.5 text-amber-400" />
                  Tech-stack gaps
                </Card.Title>
                <Card.Description class="text-xs">
                  Technologies named in JDs but not on your CV. Recurring gaps are candidates for
                  either a CV update or a filter that excludes JDs that lead with them.
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1.5">
                {#each p.techStackGaps.slice(0, 8) as g (g.skill)}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="flex-1 min-w-0 truncate font-mono" title={g.skill}>{g.skill}</div>
                    <div class="font-mono tabular-nums text-muted-foreground">
                      {fmtCount(g.frequency)}×
                    </div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

        <p class="text-[11px] text-muted-foreground/60 text-center">
          Generated {p.metadata?.analysisDate ?? 'just now'} · cached for 10 minutes · click Refresh to
          recompute against the latest tracker.
        </p>
      {/if}
    </div>
  </div>
</div>
