<script lang="ts">
  /**
   * OfferPanel — log offer + run counter rounds + attach benchmark +
   * compute EV + close as accepted/declined.
   */

  import { untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import { toast } from 'svelte-sonner';

  type OfferRound = {
    kind: 'initial' | 'counter-by-candidate' | 'counter-by-recruiter' | 'final';
    at: number;
    base: number;
    bonus?: number;
    signing?: number;
    equity?: number;
    equityVestingYears?: number;
    otherCash?: number;
    notes?: string;
  };

  type OfferBenchmark = {
    source: string;
    medianTc?: number;
    p25Tc?: number;
    p75Tc?: number;
    currency: string;
    refreshedAt: number;
    sourceUrl?: string;
  };

  type Offer = {
    jobId: string;
    currency: string;
    receivedAt: number;
    decisionDeadline?: number;
    rounds: OfferRound[];
    benchmark?: OfferBenchmark;
  };

  let {
    jobId,
    profileId,
    offer,
    offerCurrent,
    offerTc,
    offerBatna,
  }: {
    jobId: string;
    profileId: string;
    offer: Offer | null;
    offerCurrent: OfferRound | null;
    offerTc: number;
    offerBatna: number;
  } = $props();

  // Initialize form state from incoming props. These are user-editable values
  // that persist across re-renders; we deliberately don't $derive so the user
  // can edit them without props blowing the state away. Initial values are
  // captured ONCE on mount — subsequent prop changes won't update the form
  // (which is the right UX for an editor).
  //
  // `untrack()` tells Svelte 5 this is intentional — otherwise it warns
  // "This reference only captures the initial value" on every build.
  const initialOffer = untrack(() => offer);
  const initialCurrent = untrack(() => offerCurrent);
  let formCurrency = $state(initialOffer?.currency ?? 'USD');
  let formBase = $state(initialCurrent?.base ?? 0);
  let formBonus = $state(initialCurrent?.bonus ?? 0);
  let formSigning = $state(initialCurrent?.signing ?? 0);
  let formEquity = $state(initialCurrent?.equity ?? 0);
  let formEquityYears = $state(initialCurrent?.equityVestingYears ?? 4);
  let formOther = $state(initialCurrent?.otherCash ?? 0);
  let formDeadline = $state(
    initialOffer?.decisionDeadline
      ? new Date(initialOffer.decisionDeadline).toISOString().slice(0, 16)
      : '',
  );
  let busy = $state<string | null>(null);
  let evResult = $state<{ ev: number; verdict: string; breakdown?: unknown } | null>(null);

  // EV form state
  let evGrowth = $state(3);
  let evTeam = $state(3);
  let evCommute = $state(3);
  let evMission = $state(3);
  let evWLB = $state(3);
  let showEvForm = $state(false);

  async function saveOffer() {
    if (formBase <= 0) {
      toast.error('Base salary must be positive');
      return;
    }
    busy = 'save';
    try {
      const body = {
        currency: formCurrency,
        decisionDeadline: formDeadline ? new Date(formDeadline).getTime() : undefined,
        initial: {
          base: formBase,
          bonus: formBonus || undefined,
          signing: formSigning || undefined,
          equity: formEquity || undefined,
          equityVestingYears: formEquityYears,
          otherCash: formOther || undefined,
        },
      };
      const res = await api.post<{ ok: boolean }>(`/api/job/${jobId}/offer`, body);
      if (res.ok) {
        toast.success('Offer saved');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  async function counterOffer() {
    if (formBase <= 0) {
      toast.error('Base must be positive');
      return;
    }
    busy = 'counter';
    try {
      const body = {
        kind: 'counter-by-candidate',
        base: formBase,
        bonus: formBonus || undefined,
        signing: formSigning || undefined,
        equity: formEquity || undefined,
        equityVestingYears: formEquityYears,
        otherCash: formOther || undefined,
      };
      const res = await api.post<{ ok: boolean }>(`/api/job/${jobId}/offer/counter`, body);
      if (res.ok) {
        toast.success('Counter recorded');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  async function pullBenchmark() {
    busy = 'bench';
    try {
      const res = await api.post<{ ok: boolean }>(`/api/job/${jobId}/offer/benchmark`, {});
      if (res.ok) {
        toast.success('Benchmark attached');
        await invalidateAll();
      } else {
        toast.error('Benchmark fetch failed — try manual paste');
      }
    } finally {
      busy = null;
    }
  }

  async function computeEv() {
    busy = 'ev';
    try {
      const res = await api.post<{ ok: boolean; ev: number; verdict: string; breakdown: unknown }>(
        `/api/job/${jobId}/offer/ev`,
        {
          growthFit: evGrowth,
          teamFit: evTeam,
          commuteFit: evCommute,
          missionFit: evMission,
          workLifeBalance: evWLB,
        },
      );
      if (res.ok) {
        evResult = { ev: res.ev, verdict: res.verdict, breakdown: res.breakdown };
      }
    } finally {
      busy = null;
    }
  }

  async function closeOffer(outcome: 'accepted' | 'declined' | 'rescinded') {
    if (!window.confirm('Mark this offer as ' + outcome + '?')) return;
    busy = 'close';
    try {
      const res = await api.post<{ ok: boolean }>(`/api/job/${jobId}/offer/close`, { outcome });
      if (res.ok) {
        toast.success('Offer closed: ' + outcome);
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  function fmtMoney(n: number, c: string): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: c,
      maximumFractionDigits: 0,
    }).format(n);
  }
</script>

<section id="offer" class="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/40 p-5">
  <header class="flex items-center justify-between">
    <h3 class="text-base font-medium">Offer & negotiation</h3>
    {#if offer}
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-xs"
          >TC {fmtMoney(offerTc, offer.currency)} · {offer.rounds.length} rounds</Badge
        >
        <Badge variant="outline" class="text-xs">BATNA {offerBatna}</Badge>
      </div>
    {/if}
  </header>

  <div class="grid grid-cols-2 gap-3 text-sm">
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Currency</span>
      <select
        bind:value={formCurrency}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
      >
        <option>USD</option>
        <option>EUR</option>
        <option>GBP</option>
        <option>CAD</option>
        <option>AUD</option>
        <option>JPY</option>
      </select>
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Deadline</span>
      <input
        type="datetime-local"
        bind:value={formDeadline}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Base</span>
      <input
        type="number"
        bind:value={formBase}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Bonus</span>
      <input
        type="number"
        bind:value={formBonus}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Signing</span>
      <input
        type="number"
        bind:value={formSigning}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Equity</span>
      <input
        type="number"
        bind:value={formEquity}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Vest yrs</span>
      <input
        type="number"
        bind:value={formEquityYears}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-20 text-xs text-zinc-400">Other</span>
      <input
        type="number"
        bind:value={formOther}
        class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
      />
    </label>
  </div>

  <div class="flex flex-wrap gap-2">
    <Button size="sm" onclick={saveOffer} disabled={busy === 'save'}>
      {offer ? 'Update initial' : 'Save offer'}
    </Button>
    {#if offer}
      <Button size="sm" variant="outline" onclick={counterOffer} disabled={busy === 'counter'}>
        Counter round
      </Button>
      <Button size="sm" variant="outline" onclick={pullBenchmark} disabled={busy === 'bench'}>
        {offer.benchmark ? 'Refresh band' : 'Pull band'}
      </Button>
      <Button size="sm" variant="outline" onclick={() => (showEvForm = !showEvForm)}>
        EV calc
      </Button>
      <Button size="sm" variant="outline" onclick={() => closeOffer('accepted')}>Accept</Button>
      <Button size="sm" variant="ghost" onclick={() => closeOffer('declined')}>Decline</Button>
    {/if}
  </div>

  {#if offer?.benchmark}
    <div class="rounded border border-zinc-800 bg-zinc-950/50 p-3 text-sm">
      <div class="text-xs text-zinc-400">
        Band — {offer.benchmark.source} · refreshed {new Date(
          offer.benchmark.refreshedAt,
        ).toLocaleDateString()}
      </div>
      <div class="font-mono">
        median {fmtMoney(offer.benchmark.medianTc ?? 0, offer.benchmark.currency)}
        {#if offer.benchmark.p25Tc}
          · p25 {fmtMoney(offer.benchmark.p25Tc, offer.benchmark.currency)}
        {/if}
        {#if offer.benchmark.p75Tc}
          · p75 {fmtMoney(offer.benchmark.p75Tc, offer.benchmark.currency)}
        {/if}
      </div>
    </div>
  {/if}

  {#if showEvForm}
    <div class="space-y-2 rounded border border-zinc-800 bg-zinc-950/50 p-3 text-sm">
      <h4 class="text-xs uppercase text-zinc-400">EV calculator (rate each 1-5)</h4>
      {#each [{ k: 'growth', label: 'Growth fit', v: evGrowth }, { k: 'team', label: 'Team fit', v: evTeam }, { k: 'commute', label: 'Commute fit', v: evCommute }, { k: 'mission', label: 'Mission fit', v: evMission }, { k: 'wlb', label: 'Work-life balance', v: evWLB }] as row}
        <label class="flex items-center gap-3">
          <span class="w-40 text-xs">{row.label}</span>
          <input
            type="range"
            min="1"
            max="5"
            value={row.v}
            oninput={(e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (row.k === 'growth') evGrowth = v;
              else if (row.k === 'team') evTeam = v;
              else if (row.k === 'commute') evCommute = v;
              else if (row.k === 'mission') evMission = v;
              else if (row.k === 'wlb') evWLB = v;
            }}
            class="flex-1"
          />
          <span class="w-6 text-center font-mono">{row.v}</span>
        </label>
      {/each}
      <Button size="sm" onclick={computeEv} disabled={busy === 'ev'}>Compute</Button>
      {#if evResult}
        <div class="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div class="text-lg font-mono">
            EV {evResult.ev}/100 — <span class="text-emerald-300">{evResult.verdict}</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>
