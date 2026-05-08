<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import {
    Lightbulb, RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
    Target, Building2, Globe, Loader2, Sparkles,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { withMinDuration, cn } from '$lib/utils';
  import type { PatternsResult } from '$lib/server/analyze-patterns';

  let { data }: { data: { patterns: PatternsResult | null; loadError: string | null } } = $props();

  let refreshing = $state(false);
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await withMinDuration(api.get('/api/insights/patterns?fresh=1', { silent: true }), 600);
      await invalidateAll();
      toast.success('Insights refreshed');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Refresh failed', { description: err.message, action: { label: 'Retry', onClick: () => refresh() } });
    } finally {
      refreshing = false;
    }
  }

  let p = $derived(data.patterns);
  let total = $derived(p?.metadata?.total ?? 0);

  // Highest-leverage clusters: archetypes + remote policy where positive rate
  // diverges sharply. Sort by absolute deviation from the global positive rate.
  let archetypeRows = $derived.by(() => {
    if (!p?.archetypeBreakdown) return [];
    const out = Object.entries(p.archetypeBreakdown).map(([name, v]) => ({ name, ...v }));
    return out.sort((a, b) => b.count - a.count);
  });

  let remoteRows = $derived.by(() => {
    if (!p?.remotePolicy) return [];
    return Object.entries(p.remotePolicy).map(([policy, v]) => ({ policy, ...v }));
  });

  let companySizeRows = $derived.by(() => {
    if (!p?.companySizeBreakdown) return [];
    return Object.entries(p.companySizeBreakdown).map(([size, v]) => ({ size, ...v }));
  });

  function pct(n: number): string { return (Math.round(n * 100)) + '%'; }
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Insights"
    subtitle={p?.metadata ? p.metadata.total + ' apps · ' + p.metadata.dateRange.from + ' → ' + p.metadata.dateRange.to : undefined}
    showTabs={false}
  />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">

      <!-- Hero -->
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1.5 max-w-3xl">
          <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Lightbulb class="size-5 text-amber-400" />
            Patterns &amp; recommendations
          </h1>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Pulls applications.md + every deep-eval report through <code class="font-mono text-foreground/80">analyze-patterns.mjs</code> to
            surface where you're winning and where the system is wasting your effort. Recompute when you've added 10+ new outcomes.
          </p>
        </div>
        <Button onclick={refresh} disabled={refreshing} class="gap-1.5 flex-shrink-0">
          {#if refreshing}<Loader2 class="size-3.5 animate-spin" /> Recomputing…{:else}<RefreshCw class="size-3.5" /> Refresh{/if}
        </Button>
      </div>

      {#if data.loadError}
        <ErrorState size="md" title="Couldn't load patterns" error={data.loadError} onretry={refresh} />
      {:else if !p || total === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={Lightbulb}
          title="Not enough data yet"
          description="Apply to a few jobs and capture their outcomes (Rejected / Screened / Interview / Offer). Once you have ~10 finished outcomes the patterns get useful."
        />
      {:else}

        <!-- Top recommendations — the headline, computed by the script -->
        {#if p.recommendations && p.recommendations.length > 0}
          <Card.Root class="border-amber-500/40 bg-amber-500/5">
            <Card.Header class="pb-3">
              <Card.Title class="text-sm flex items-center gap-2">
                <Sparkles class="size-4 text-amber-400" />
                Top recommendations
              </Card.Title>
              <Card.Description class="text-xs">
                Auto-generated from your conversion funnel + score-vs-outcome correlation.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <ul class="space-y-1.5">
                {#each p.recommendations as rec}
                  <li class="text-xs flex items-start gap-2 leading-relaxed">
                    <span class="text-amber-400 mt-0.5">→</span>
                    <span>{rec}</span>
                  </li>
                {/each}
              </ul>
            </Card.Content>
          </Card.Root>
        {/if}

        <!-- Two-up: funnel + score by outcome -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <Target class="size-3.5 text-muted-foreground" />
                Conversion funnel
              </Card.Title>
              <Card.Description class="text-xs">From application to outcome.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-1.5">
              {#each Object.entries(p.funnel ?? {}) as [stage, count]}
                {@const all = Object.values(p.funnel ?? {}).reduce((a, b) => a + (b as number), 0)}
                {@const w = all > 0 ? (count / all) * 100 : 0}
                <div class="flex items-center gap-3 text-xs">
                  <div class="w-28 shrink-0 text-muted-foreground">{stage}</div>
                  <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div class="absolute inset-y-0 left-0 bg-primary/40" style={'width: ' + w + '%'}></div>
                  </div>
                  <div class="w-12 text-right tabular-nums font-medium">{count}</div>
                </div>
              {/each}
              {#if !p.funnel || Object.keys(p.funnel).length === 0}
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
              <Card.Description class="text-xs">Average fit score grouped by what happened.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-1.5">
              {#each Object.entries(p.scoreComparison ?? {}) as [group, stats]}
                {@const tint = group === 'positive' ? 'text-emerald-300' : group === 'negative' ? 'text-red-300' : 'text-muted-foreground'}
                <div class="flex items-center gap-3 text-xs">
                  <div class="w-24 shrink-0 capitalize {tint}">{group}</div>
                  <div class="flex-1 font-mono tabular-nums">avg {stats.avg.toFixed(1)} · range {stats.min.toFixed(1)}–{stats.max.toFixed(1)}</div>
                  <div class="w-12 text-right text-muted-foreground tabular-nums">n={stats.count}</div>
                </div>
              {/each}
              {#if p.scoreThreshold}
                <div class="pt-2 mt-2 border-t border-border/40 text-[11px] text-muted-foreground leading-relaxed">
                  <span class="text-amber-300 font-medium">Suggested floor:</span> {p.scoreThreshold.suggestedFloor}/5 — {p.scoreThreshold.rationale}
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>

        <!-- Archetype breakdown -->
        {#if archetypeRows.length > 0}
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-sm flex items-center gap-2">
                <Sparkles class="size-3.5 text-muted-foreground" />
                Archetype breakdown
              </Card.Title>
              <Card.Description class="text-xs">Where you convert vs where you don't. Aim is to apply more in the rows with high positive rates.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Tooltip.Provider delayDuration={300}>
                <div class="space-y-1">
                  {#each archetypeRows as row}
                    {@const tint = row.positiveRate >= 0.3 ? 'bg-emerald-500/40' : row.positiveRate >= 0.15 ? 'bg-amber-500/40' : 'bg-red-500/40'}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <div {...props} class="flex items-center gap-3 text-xs cursor-help">
                            <div class="w-32 shrink-0 truncate" title={row.name}>{row.name}</div>
                            <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                              <div class={cn('absolute inset-y-0 left-0', tint)} style={'width: ' + (row.positiveRate * 100) + '%'}></div>
                            </div>
                            <div class="w-14 text-right tabular-nums">{pct(row.positiveRate)}</div>
                            <div class="w-12 text-right text-muted-foreground tabular-nums">n={row.count}</div>
                          </div>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="top" class="text-xs max-w-xs">
                        {row.positive} positive · {row.negative} negative outcome{row.negative === 1 ? '' : 's'} of {row.count} apps.
                      </Tooltip.Content>
                    </Tooltip.Root>
                  {/each}
                </div>
              </Tooltip.Provider>
            </Card.Content>
          </Card.Root>
        {/if}

        <!-- Remote policy + Company size two-up -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {#if remoteRows.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <Globe class="size-3.5 text-muted-foreground" />
                  Remote policy
                </Card.Title>
                <Card.Description class="text-xs">Where remote-fit roles convert vs hybrid / on-site.</Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1">
                {#each remoteRows as row}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="w-28 shrink-0 truncate capitalize">{row.policy}</div>
                    <div class="flex-1 relative h-4 rounded bg-muted/30 overflow-hidden">
                      <div class="absolute inset-y-0 left-0 bg-primary/40" style={'width: ' + (row.positiveRate * 100) + '%'}></div>
                    </div>
                    <div class="w-12 text-right tabular-nums">{pct(row.positiveRate)}</div>
                    <div class="w-10 text-right text-muted-foreground tabular-nums">n={row.count}</div>
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
                  Company size
                </Card.Title>
                <Card.Description class="text-xs">Conversion split by stage / headcount.</Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1">
                {#each companySizeRows as row}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="w-28 shrink-0 truncate capitalize">{row.size}</div>
                    <div class="flex-1 relative h-4 rounded bg-muted/30 overflow-hidden">
                      <div class="absolute inset-y-0 left-0 bg-primary/40" style={'width: ' + (row.positiveRate * 100) + '%'}></div>
                    </div>
                    <div class="w-12 text-right tabular-nums">{pct(row.positiveRate)}</div>
                    <div class="w-10 text-right text-muted-foreground tabular-nums">n={row.count}</div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

        <!-- Top blockers + tech stack gaps -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {#if p.blockerAnalysis && p.blockerAnalysis.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-2">
                  <AlertTriangle class="size-3.5 text-red-400" />
                  Top blockers
                </Card.Title>
                <Card.Description class="text-xs">Most-cited reasons evaluations marked you "marginal" or worse.</Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1.5">
                {#each p.blockerAnalysis.slice(0, 8) as b}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="flex-1 min-w-0 truncate" title={b.blocker}>{b.blocker}</div>
                    <div class="font-mono tabular-nums text-muted-foreground">{b.frequency}× · {b.percentage}%</div>
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
                <Card.Description class="text-xs">Tech mentioned in postings you didn't have on your CV.</Card.Description>
              </Card.Header>
              <Card.Content class="space-y-1.5">
                {#each p.techStackGaps.slice(0, 8) as g}
                  <div class="flex items-center gap-3 text-xs">
                    <div class="flex-1 min-w-0 truncate font-mono" title={g.tech}>{g.tech}</div>
                    <div class="font-mono tabular-nums text-muted-foreground">{g.freq}×</div>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

        <p class="text-[10px] text-muted-foreground/60 text-center">
          Generated {p.metadata?.analysisDate ?? 'just now'} · cached for 10 min · click Refresh for live recompute.
        </p>
      {/if}
    </div>
  </div>
</div>
