<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Funnel from '$lib/components/charts/Funnel.svelte';
  import Histogram from '$lib/components/charts/Histogram.svelte';
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import StackedBar from '$lib/components/charts/StackedBar.svelte';
  import { ArrowRight, Play, Sparkles, AlertCircle, TrendingUp, TrendingDown, Building2, Globe, CheckCircle2 } from '@lucide/svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api } from '$lib/api';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  const STATUS_TINT: Record<string, string> = {
    New: 'bg-zinc-400/60',
    Scoring: 'bg-blue-400/60',
    Scored: 'bg-cyan-400/60',
    Ready: 'bg-emerald-400/70',
    Applied: 'bg-violet-400/70',
    Screened: 'bg-amber-400/70',
    Interview: 'bg-orange-400/70',
    Offer: 'bg-green-400/80',
    Rejected: 'bg-red-400/60',
    Closed: 'bg-zinc-500/40',
  };

  const BG_TINT: Record<string, string> = {
    LOW: 'bg-emerald-500/60',
    MEDIUM: 'bg-amber-500/60',
    HIGH: 'bg-red-500/60',
    BLOCKED: 'bg-red-700/80',
    Unknown: 'bg-zinc-500/40',
  };

  let funnelStages = $derived(
    data.funnel
      .filter((f) => f.count > 0)
      .map((f) => ({ label: f.status, count: f.count, tint: STATUS_TINT[f.status] ?? 'bg-primary/40' }))
  );

  let histogramBuckets = $derived(
    data.buckets.map((b) => {
      let tint = 'bg-red-500/30';
      let subTint = 'bg-red-500/70';
      if (b.label === '2–3') { tint = 'bg-amber-500/30'; subTint = 'bg-amber-500/70'; }
      else if (b.label === '3–4') { tint = 'bg-emerald-500/30'; subTint = 'bg-emerald-500/70'; }
      else if (b.label === '4–5') { tint = 'bg-emerald-500/40'; subTint = 'bg-emerald-500/90'; }
      return {
        label: b.label,
        value: b.total,
        tint,
        sub: { value: b.applied, tint: subTint, label: 'applied' },
      };
    })
  );

  let bgSegments = $derived([
    { label: 'LOW', value: data.bgCounts.LOW, tint: BG_TINT.LOW },
    { label: 'MEDIUM', value: data.bgCounts.MEDIUM, tint: BG_TINT.MEDIUM },
    { label: 'HIGH', value: data.bgCounts.HIGH, tint: BG_TINT.HIGH },
    { label: 'BLOCKED', value: data.bgCounts.BLOCKED, tint: BG_TINT.BLOCKED },
    { label: 'Unknown', value: data.bgUnknown, tint: BG_TINT.Unknown },
  ]);

  let velocityData = $derived(data.velocity.map((v) => v.count));

  function pct(n: number) { return (n * 100).toFixed(1) + '%'; }

  let busy = $state(false);
  async function runScan() {
    busy = true;
    try {
      await api.post('/api/run', { task: 'scan' }, { successToast: 'Scan started' });
      await invalidateAll();
    } finally { busy = false; }
  }
  async function runGemini() {
    busy = true;
    try {
      await api.post('/api/run', { task: 'gemini' }, { successToast: 'Gemini scoring started' });
      await invalidateAll();
    } finally { busy = false; }
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Stats" showTabs={false} />
  <div class="p-6">
    <div class="max-w-6xl mx-auto space-y-6">

      {#if data.pipelineStaleDays != null && data.pipelineStaleDays >= 7}
        <Card.Root class="border-amber-500/40 bg-amber-500/5">
          <Card.Content class="flex items-center gap-3 p-4">
            <AlertCircle class="size-5 text-amber-400 shrink-0" />
            <div class="flex-1">
              <div class="text-sm font-medium text-amber-200">Pipeline is {data.pipelineStaleDays} days old</div>
              <div class="text-xs text-amber-200/70">Run a fresh scan to find new jobs.</div>
            </div>
            <Button size="sm" variant="outline" class="gap-1.5" onclick={runScan} disabled={busy}>
              <Play class="size-3.5" /> Run scan
            </Button>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if data.unscored > 0 && data.counts.total > 0 && data.unscored / data.counts.total > 0.3}
        <Card.Root class="border-cyan-500/40 bg-cyan-500/5">
          <Card.Content class="flex items-center gap-3 p-4">
            <Sparkles class="size-5 text-cyan-400 shrink-0" />
            <div class="flex-1">
              <div class="text-sm font-medium text-cyan-200">{data.unscored} jobs unscored</div>
              <div class="text-xs text-cyan-200/70">Run Gemini first-pass to triage them quickly.</div>
            </div>
            <Button size="sm" variant="outline" class="gap-1.5" onclick={runGemini} disabled={busy}>
              <Play class="size-3.5" /> Run Gemini
            </Button>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Hero metrics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Description class="text-[11px] uppercase tracking-wide">Pipeline</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-1">
            <div class="text-2xl font-semibold tabular-nums">{data.counts.total.toLocaleString()}</div>
            <div class="text-[11px] text-muted-foreground">{data.reports} reports · {data.pdfs} PDFs</div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Description class="text-[11px] uppercase tracking-wide">Applied</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-1">
            <div class="text-2xl font-semibold tabular-nums">{data.applied}</div>
            <div class="text-[11px] text-muted-foreground">
              {pct(data.conversion.overallApplied)} of pipeline
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Description class="text-[11px] uppercase tracking-wide">Avg score</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-1">
            <div class="text-2xl font-semibold tabular-nums">{data.avgScore.toFixed(2)}</div>
            <div class="text-[11px] text-muted-foreground">across {data.counts.total - data.unscored} scored</div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Description class="text-[11px] uppercase tracking-wide">Velocity</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-1">
            <div class="flex items-end justify-between gap-2">
              <div class="text-2xl font-semibold tabular-nums">{data.last7}</div>
              <Sparkline data={velocityData} width={70} height={24} stroke="rgb(110, 231, 183)" fill="rgb(110, 231, 183)" />
            </div>
            <div class="text-[11px] text-muted-foreground flex items-center gap-1">
              {#if data.velocityDelta != null && data.velocityDelta !== 0}
                {#if data.velocityDelta > 0}
                  <TrendingUp class="size-3 text-emerald-400" />
                  <span class="text-emerald-400">+{data.velocityDelta}%</span>
                {:else}
                  <TrendingDown class="size-3 text-red-400" />
                  <span class="text-red-400">{data.velocityDelta}%</span>
                {/if}
                <span>vs prior 7d</span>
              {:else}
                <span>applications last 7d</span>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <!-- Funnel -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-sm">Pipeline funnel</Card.Title>
          <Card.Description class="text-xs">Drop-off between stages, in order.</Card.Description>
        </Card.Header>
        <Card.Content>
          <Funnel stages={funnelStages} />
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Scored / total</div>
              <div class="text-sm font-semibold tabular-nums">{pct(data.conversion.scoredOfTotal)}</div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Ready / scored</div>
              <div class="text-sm font-semibold tabular-nums">{pct(data.conversion.readyOfScored)}</div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Applied / ready</div>
              <div class="text-sm font-semibold tabular-nums">{pct(data.conversion.appliedOfReady)}</div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Interview / applied</div>
              <div class="text-sm font-semibold tabular-nums">{pct(data.conversion.interviewOfApplied)}</div>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Score distribution + BG risk side-by-side -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm">Score distribution</Card.Title>
            <Card.Description class="text-xs">Stacked: applied (darker) vs unapplied. {data.unscored} unscored.</Card.Description>
          </Card.Header>
          <Card.Content>
            <Histogram buckets={histogramBuckets} height={120} />
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm">Background-check risk</Card.Title>
            <Card.Description class="text-xs">Distribution across scored jobs.</Card.Description>
          </Card.Header>
          <Card.Content>
            <StackedBar segments={bgSegments} />
            {#if data.bgCounts.BLOCKED > 0}
              <div class="mt-3 text-[11px] text-red-300 flex items-center gap-1.5">
                <AlertCircle class="size-3.5" />
                <span>{data.bgCounts.BLOCKED} jobs flagged BLOCKED — auto-skipped from apply.</span>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>

      <!-- Top companies + Top sources -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm">Top 10 companies</Card.Title>
            <Card.Description class="text-xs">By count in pipeline.</Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="space-y-1.5">
              {#each data.topCompanies as c}
                {@const max = data.topCompanies[0]?.count ?? 1}
                {@const pct2 = (c.count / max) * 100}
                <div class="flex items-center gap-3">
                  <div class="w-32 text-xs overflow-hidden whitespace-nowrap shrink-0" title={c.name}>{c.name}</div>
                  <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div class="absolute inset-y-0 left-0 bg-primary/40" style={'width: ' + pct2 + '%'}></div>
                  </div>
                  <div class="w-10 text-right text-xs font-medium tabular-nums">{c.count}</div>
                </div>
              {/each}
              {#if data.topCompanies.length === 0}
                <EmptyState size="sm" variant="inline" icon={Building2} description="No companies yet — run a scan." />
              {/if}
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm">Top sources</Card.Title>
            <Card.Description class="text-xs">Volume + apply rate.</Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="space-y-1.5">
              {#each data.topSources as s}
                {@const max = data.topSources[0]?.count ?? 1}
                {@const pct2 = (s.count / max) * 100}
                <div class="flex items-center gap-3">
                  <div class="w-28 text-xs overflow-hidden whitespace-nowrap shrink-0" title={s.name}>{s.name}</div>
                  <div class="flex-1 relative h-5 rounded bg-muted/30 overflow-hidden">
                    <div class="absolute inset-y-0 left-0 bg-cyan-500/40" style={'width: ' + pct2 + '%'}></div>
                  </div>
                  <div class="w-10 text-right text-xs font-medium tabular-nums">{s.count}</div>
                  <div class="w-12 text-right text-[10px] text-muted-foreground tabular-nums">{pct(s.rate)}</div>
                </div>
              {/each}
              {#if data.topSources.length === 0}
                <EmptyState size="sm" variant="inline" icon={Globe} description="No source data yet — run a scan." />
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <!-- Top 5 ready jobs -->
      <Card.Root>
        <Card.Header class="pb-2 flex flex-row items-center justify-between">
          <div>
            <Card.Title class="text-sm">Next up: top {data.topReady.length || 0} Ready</Card.Title>
            <Card.Description class="text-xs">Highest-scoring jobs awaiting application.</Card.Description>
          </div>
          <Button variant="ghost" size="sm" class="text-xs gap-1" href="/?tab=ready">
            View all <ArrowRight class="size-3" />
          </Button>
        </Card.Header>
        <Card.Content>
          {#if data.topReady.length === 0}
            <EmptyState size="sm" variant="inline" icon={CheckCircle2} description="No Ready jobs. Run Gemini scoring + a deep evaluation pass to fill the queue." />
          {:else}
            <div class="space-y-1.5">
              {#each data.topReady as j}
                <a href={'/job/' + j.id} class="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/40 transition-colors">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium overflow-hidden whitespace-nowrap">{j.company}</div>
                    <div class="text-xs text-muted-foreground overflow-hidden whitespace-nowrap">{j.role}</div>
                  </div>
                  {#if j.bgRisk}
                    <span class={'text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ' + (j.bgRisk === 'BLOCKED' ? 'bg-red-700/80 text-red-100' : j.bgRisk === 'HIGH' ? 'bg-red-500/30 text-red-200' : j.bgRisk === 'MEDIUM' ? 'bg-amber-500/30 text-amber-200' : 'bg-emerald-500/30 text-emerald-200')}>{j.bgRisk}</span>
                  {/if}
                  {#if j.score != null}
                    <span class="text-sm font-semibold tabular-nums w-10 text-right">{j.score.toFixed(1)}</span>
                  {/if}
                </a>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

    </div>
  </div>
</div>
