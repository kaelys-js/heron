<script lang="ts">
  import { docTitle } from '$lib/config/branding';

  let { data } = $props();

  function fmtMoney(amount: number, currency: string): string {
    if (!amount) return '—';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function fmtDate(ms: number | null): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString();
  }

  function batnaTint(score: number): string {
    if (score >= 80) return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50';
    if (score >= 60) return 'bg-lime-500/15 text-lime-200 border-lime-500/40';
    if (score >= 40) return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
    return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40';
  }

  function bandTint(ratio: number | null): string {
    if (ratio == null) return 'text-zinc-400';
    if (ratio >= 1.15) return 'text-emerald-300';
    if (ratio >= 1.0) return 'text-lime-300';
    if (ratio >= 0.9) return 'text-amber-300';
    return 'text-red-300';
  }
</script>

<svelte:head>
  <title>{docTitle(['Offer comparison'])}</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 p-6">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Offer comparison</h1>
      <p class="text-sm text-zinc-400">
        {data.offers.length} active offer{data.offers.length === 1 ? '' : 's'}
        · BATNA strength shown per row
      </p>
    </div>
  </header>

  {#if data.offers.length === 0}
    <div class="rounded-lg border border-zinc-700 bg-zinc-900/50 p-8 text-center">
      <p class="text-zinc-400">
        No active offers yet. Log an offer from the negotiation tab on any job page.
      </p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-zinc-700">
      <table class="min-w-full divide-y divide-zinc-800 text-sm">
        <thead class="bg-zinc-900/60 text-xs uppercase text-zinc-400">
          <tr>
            <th class="px-3 py-2 text-left">Company / role</th>
            <th class="px-3 py-2 text-right">TC</th>
            <th class="px-3 py-2 text-right">vs band</th>
            <th class="px-3 py-2 text-right">Base</th>
            <th class="px-3 py-2 text-right">Bonus</th>
            <th class="px-3 py-2 text-right">Equity (yr)</th>
            <th class="px-3 py-2 text-right">Signing</th>
            <th class="px-3 py-2 text-center">BATNA</th>
            <th class="px-3 py-2 text-right">Deadline</th>
            <th class="px-3 py-2 text-right">Rounds</th>
            <th class="px-3 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each data.offers as o, i (o.jobId)}
            <tr class="hover:bg-zinc-900/40">
              <td class="px-3 py-2">
                <div class="font-medium">{o.company}</div>
                <div class="text-xs text-zinc-400">{o.role}</div>
                <div class="text-xs text-zinc-500">{o.location}</div>
              </td>
              <td class="px-3 py-2 text-right font-mono">{fmtMoney(o.tc, o.currency)}</td>
              <td class="px-3 py-2 text-right">
                {#if o.tcVsBand !== null}
                  <span class={bandTint(o.tcVsBand)}>{Math.round(o.tcVsBand * 100)}%</span>
                {:else}
                  <span class="text-zinc-500">—</span>
                {/if}
              </td>
              <td class="px-3 py-2 text-right font-mono text-zinc-300"
                >{fmtMoney(o.base, o.currency)}</td
              >
              <td class="px-3 py-2 text-right font-mono text-zinc-300"
                >{fmtMoney(o.bonus, o.currency)}</td
              >
              <td class="px-3 py-2 text-right font-mono text-zinc-300">
                {o.equity ? fmtMoney(Math.round(o.equity / 4), o.currency) : '—'}
              </td>
              <td class="px-3 py-2 text-right font-mono text-zinc-300"
                >{fmtMoney(o.signing, o.currency)}</td
              >
              <td class="px-3 py-2 text-center">
                <span class="rounded border px-2 py-0.5 text-xs {batnaTint(o.batna)}"
                  >{o.batna}</span
                >
              </td>
              <td class="px-3 py-2 text-right text-xs text-zinc-300"
                >{fmtDate(o.decisionDeadline)}</td
              >
              <td class="px-3 py-2 text-right text-xs text-zinc-300">{o.roundsCount}</td>
              <td class="px-3 py-2 text-right">
                <a href={`/job/${o.jobId}#offer`} class="text-xs text-cyan-400 hover:underline"
                  >Open →</a
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <section class="rounded-lg border border-zinc-700 bg-zinc-900/40 p-5">
      <h2 class="text-base font-medium">Reading the BATNA column</h2>
      <p class="mt-2 text-sm text-zinc-400">
        BATNA score (0-100) is your leverage against this specific offer. 100 = you have a clearly
        stronger alternative; 60 = roughly matched; under 40 = this offer is your best alternative.
      </p>
      <p class="mt-2 text-sm text-zinc-400">
        The "vs band" column shows your TC relative to the levels.fyi median for this role / level /
        location. <span class="text-emerald-300">≥ 100%</span> is at or above market;
        <span class="text-amber-300">85-99%</span> is below;
        <span class="text-red-300">&lt; 85%</span> is significantly below — strong leverage to counter.
      </p>
    </section>
  {/if}
</div>
