<script lang="ts">
  import { docTitle } from '$lib/config/branding';

  let { data } = $props();

  function pct(rate: number): string {
    return (rate * 100).toFixed(0) + '%';
  }

  function severityTint(severity: string): string {
    if (severity === 'error')
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200';
    if (severity === 'warn')
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200';
  }

  function leverageTint(kind: string): string {
    if (kind === 'multi-offer')
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
    if (kind === 'decision-deadline')
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    return 'border-lime-500/40 bg-lime-500/10 text-lime-800 dark:text-lime-200';
  }
</script>

<svelte:head>
  <title>{docTitle(['Reality dashboard'])}</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 p-6">
  <header>
    <h1 class="text-2xl font-semibold">Reality dashboard</h1>
    <p class="text-sm text-muted-foreground">
      What's actually happening in your search — leverage, leaks, and hidden costs.
    </p>
  </header>

  <!-- Funnel -->
  <section class="rounded-lg border border-border bg-card p-5">
    <h2 class="mb-4 text-base font-medium">Funnel rates</h2>
    {#if !data.enoughData}
      <p class="text-sm text-muted-foreground">
        {data.advice}
      </p>
    {:else}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <div class="text-xs text-muted-foreground">Applied</div>
          <div class="font-mono text-2xl">{data.funnel.applied}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Screened</div>
          <div class="font-mono text-2xl">{data.funnel.screened}</div>
          <div class="text-xs text-muted-foreground">{pct(data.funnel.appliedToScreen)}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Interview</div>
          <div class="font-mono text-2xl">{data.funnel.interview}</div>
          <div class="text-xs text-muted-foreground">{pct(data.funnel.screenToInterview)}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Offer</div>
          <div class="font-mono text-2xl">{data.funnel.offer}</div>
          <div class="text-xs text-muted-foreground">{pct(data.funnel.interviewToOffer)}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Accepted</div>
          <div class="font-mono text-2xl">{data.funnel.accepted}</div>
          <div class="text-xs text-muted-foreground">{pct(data.funnel.offerToAccept)}</div>
        </div>
      </div>
      {#if data.leakiest}
        <div class="mt-4 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <span class="text-amber-700 dark:text-amber-200">Leakiest stage:</span>
          <span class="text-foreground">{data.leakiest.name}</span>
          <span class="text-muted-foreground">({pct(data.leakiest.rate)})</span>
          <p class="mt-1 text-xs text-muted-foreground">{data.advice}</p>
        </div>
      {/if}
    {/if}
  </section>

  <!-- Leverage points -->
  <section class="rounded-lg border border-border bg-card p-5">
    <h2 class="mb-4 text-base font-medium">Leverage points</h2>
    {#if data.leverage.length === 0}
      <p class="text-sm text-muted-foreground">No active leverage in flight.</p>
    {:else}
      <ul class="space-y-2">
        {#each data.leverage as lev}
          <li class="rounded border px-3 py-2 text-sm {leverageTint(lev.kind)}">
            <span class="font-medium">{lev.kind.replace('-', ' ')}:</span>
            {lev.signal}
            {#if lev.jobId}
              <a href={`/job/${lev.jobId}`} class="ml-2 text-xs underline">Open →</a>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Hidden costs -->
  <section class="rounded-lg border border-border bg-card p-5">
    <h2 class="mb-4 text-base font-medium">Hidden costs</h2>
    {#if data.hiddenCosts.length === 0}
      <p class="text-sm text-muted-foreground">Nothing slipping — nice.</p>
    {:else}
      <ul class="space-y-2">
        {#each data.hiddenCosts as hc}
          <li class="rounded border px-3 py-2 text-sm {severityTint(hc.severity)}">
            <span class="font-mono text-base">{hc.count}</span>
            <span class="ml-2">{hc.kind.replace('-', ' ')}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
