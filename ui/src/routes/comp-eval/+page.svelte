<!--
  /comp-eval — interactive compensation calculator.

  Take a structured offer (base, signing, bonus, equity, benefits) and
  render the per-year breakdown + year-1 cash + 4-year totals + equity
  NPV. The whole thing is pure-function on the server side; we just
  POST whenever inputs change (debounced) and show the result.

  Two-offer "Compare" mode lets the user paste a competing offer for a
  side-by-side dollar delta — useful for the "your current vs your
  ceiling" negotiation conversation.
-->
<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    DollarSign, Calculator, TrendingUp, ArrowLeftRight, ChevronDown,
    Info, Sparkles,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import { onMount } from 'svelte';

  type EquityType = 'rsu-public' | 'rsu-private' | 'iso' | 'nso' | 'pre-ipo-rsu' | 'none';

  type OfferInput = {
    base: number;
    signingBonus?: number;
    annualBonusTarget?: number;
    equity?: {
      type: EquityType;
      grantValueToday: number;
      strikePerShare?: number;
      growthRatePct?: number;
    };
    benefitsAnnualValue?: number;
    equityDiscountPct?: number;
    discountRatePct?: number;
  };

  type YearBreakdown = {
    year: 1 | 2 | 3 | 4;
    base: number;
    bonus: number;
    signing: number;
    equityVested: number;
    benefits: number;
    total: number;
  };

  type OfferEvaluation = {
    perYear: YearBreakdown[];
    year1Cash: number;
    fourYearNominal: number;
    fourYearDiscounted: number;
    equityNpv: number;
    effectiveAnnual: number;
  };

  // Default values targeting a typical Senior-IC US tech offer.
  let offer = $state<OfferInput>({
    base: 200000,
    signingBonus: 25000,
    annualBonusTarget: 30000,
    equity: {
      type: 'rsu-public',
      grantValueToday: 300000,
      growthRatePct: 0,
    },
    benefitsAnnualValue: 15000,
    equityDiscountPct: 30,
    discountRatePct: 5,
  });

  let result = $state<OfferEvaluation | null>(null);
  let computing = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Compare mode
  let compareMode = $state(false);
  let offerB = $state<OfferInput>({ ...offer, base: 220000 });
  let comparison = $state<{
    preferred: 'a' | 'b' | 'tied';
    metric: string;
    delta: number;
    a: OfferEvaluation;
    b: OfferEvaluation;
  } | null>(null);

  function fmt(n: number): string {
    if (!Number.isFinite(n)) return '$0';
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(Math.round(n)).toLocaleString();
  }

  async function compute() {
    if (computing) return;
    computing = true;
    try {
      if (compareMode) {
        const r = await api.post<typeof comparison>('/api/comp-eval', { compare: true, a: offer, b: offerB }, { silent: true });
        comparison = r;
        result = r?.a ?? null;
      } else {
        const r = await api.post<OfferEvaluation>('/api/comp-eval', offer, { silent: true });
        result = r;
        comparison = null;
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Eval failed', { description: err.message });
    } finally {
      computing = false;
    }
  }

  function debouncedCompute() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(compute, 400);
  }

  // Re-compute on any input change.
  $effect(() => {
    // Re-read state to register reactivity.
    void offer.base; void offer.signingBonus; void offer.annualBonusTarget;
    void offer.equity?.grantValueToday; void offer.equity?.growthRatePct; void offer.equity?.type;
    void offer.benefitsAnnualValue; void offer.equityDiscountPct; void offer.discountRatePct;
    if (compareMode) {
      void offerB.base; void offerB.signingBonus; void offerB.annualBonusTarget;
      void offerB.equity?.grantValueToday;
    }
    debouncedCompute();
  });

  onMount(() => { compute(); });
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Comp evaluator" subtitle="structured offer math" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="size-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/40 flex items-center justify-center">
            <Calculator class="size-5 text-emerald-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Compensation calculator</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Plug in a structured offer (base, signing, target bonus, equity grant, benefits). Get
          the per-year breakdown, year-1 cash, 4-year nominal, 4-year discounted, and equity NPV.
          Toggle "Compare" to put a competing offer side-by-side for the negotiation conversation.
          All math is deterministic — no LLM eyeballing.
        </p>
      </div>

      <!-- Compare toggle -->
      <div class="flex items-center gap-2">
        <Button
          onclick={() => { compareMode = !compareMode; compute(); }}
          variant={compareMode ? 'default' : 'outline'}
          size="sm"
          class="gap-1.5"
        >
          <ArrowLeftRight class="size-3" />
          {compareMode ? 'Single offer' : 'Compare two offers'}
        </Button>
        {#if computing}
          <span class="text-[11px] text-muted-foreground">recalculating…</span>
        {/if}
      </div>

      <div class={cn('grid gap-5', compareMode ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
        <!-- Offer A inputs -->
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-base flex items-center gap-2">
              <DollarSign class="size-4 text-emerald-400" />
              {compareMode ? 'Offer A' : 'Offer'}
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">Base ($)</Label>
                <Input type="number" bind:value={offer.base} class="h-9 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Signing bonus ($)</Label>
                <Input type="number" bind:value={offer.signingBonus} class="h-9 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Annual bonus target ($)</Label>
                <Input type="number" bind:value={offer.annualBonusTarget} class="h-9 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Benefits / yr ($)</Label>
                <Input type="number" bind:value={offer.benefitsAnnualValue} class="h-9 text-sm" />
              </div>
            </div>

            <div class="space-y-1">
              <Label class="text-xs">Equity type</Label>
              <select
                bind:value={offer.equity!.type}
                class="h-9 w-full rounded-md border border-border/40 bg-card text-xs px-2"
              >
                <option value="none">None</option>
                <option value="rsu-public">RSU — public company</option>
                <option value="rsu-private">RSU — private (409A)</option>
                <option value="pre-ipo-rsu">Pre-IPO RSU (double-trigger)</option>
                <option value="iso">ISO options</option>
                <option value="nso">NSO options</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">Grant value @ today ($)</Label>
                <Input type="number" bind:value={offer.equity!.grantValueToday} class="h-9 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Growth assumption (%/yr)</Label>
                <Input type="number" bind:value={offer.equity!.growthRatePct} class="h-9 text-sm" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
              <div class="space-y-1">
                <Label class="text-xs">Equity discount (%)</Label>
                <Input type="number" min="0" max="100" bind:value={offer.equityDiscountPct} class="h-9 text-sm" />
                <p class="text-[10px] text-muted-foreground/70">How much less you value paper vs cash. 30% is a reasonable default for pre-IPO.</p>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Discount rate (%/yr)</Label>
                <Input type="number" min="0" max="50" bind:value={offer.discountRatePct} class="h-9 text-sm" />
                <p class="text-[10px] text-muted-foreground/70">Time-value of money. 5% ≈ savings rate.</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Offer B (compare mode) -->
        {#if compareMode}
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-base flex items-center gap-2">
                <DollarSign class="size-4 text-fuchsia-400" />
                Offer B
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <Label class="text-xs">Base ($)</Label>
                  <Input type="number" bind:value={offerB.base} class="h-9 text-sm" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Signing bonus ($)</Label>
                  <Input type="number" bind:value={offerB.signingBonus} class="h-9 text-sm" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Annual bonus target ($)</Label>
                  <Input type="number" bind:value={offerB.annualBonusTarget} class="h-9 text-sm" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Benefits / yr ($)</Label>
                  <Input type="number" bind:value={offerB.benefitsAnnualValue} class="h-9 text-sm" />
                </div>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Equity type</Label>
                <select
                  bind:value={offerB.equity!.type}
                  class="h-9 w-full rounded-md border border-border/40 bg-card text-xs px-2"
                >
                  <option value="none">None</option>
                  <option value="rsu-public">RSU — public</option>
                  <option value="rsu-private">RSU — private</option>
                  <option value="pre-ipo-rsu">Pre-IPO RSU</option>
                  <option value="iso">ISO</option>
                  <option value="nso">NSO</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <Label class="text-xs">Grant value @ today ($)</Label>
                  <Input type="number" bind:value={offerB.equity!.grantValueToday} class="h-9 text-sm" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Growth (%/yr)</Label>
                  <Input type="number" bind:value={offerB.equity!.growthRatePct} class="h-9 text-sm" />
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        {/if}
      </div>

      <!-- Results -->
      {#if result}
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-base flex items-center gap-2">
              <TrendingUp class="size-4 text-emerald-400" />
              {compareMode ? 'Offer A results' : 'Results'}
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="rounded-md border border-border/40 bg-card px-3 py-2">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Year 1 cash</div>
                <div class="text-lg font-mono font-semibold">{fmt(result.year1Cash)}</div>
                <div class="text-[10px] text-muted-foreground/70">no equity</div>
              </div>
              <div class="rounded-md border border-border/40 bg-card px-3 py-2">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">4-year total</div>
                <div class="text-lg font-mono font-semibold">{fmt(result.fourYearNominal)}</div>
                <div class="text-[10px] text-muted-foreground/70">nominal</div>
              </div>
              <div class="rounded-md border border-border/40 bg-card px-3 py-2">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">4-yr discounted</div>
                <div class="text-lg font-mono font-semibold">{fmt(result.fourYearDiscounted)}</div>
                <div class="text-[10px] text-muted-foreground/70">@ {offer.discountRatePct}%/yr</div>
              </div>
              <div class="rounded-md border border-border/40 bg-card px-3 py-2">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Equity NPV</div>
                <div class="text-lg font-mono font-semibold">{fmt(result.equityNpv)}</div>
                <div class="text-[10px] text-muted-foreground/70">risk + discount</div>
              </div>
            </div>

            <div class="text-xs text-muted-foreground">
              Effective annual: <span class="font-mono text-foreground">{fmt(result.effectiveAnnual)}</span>
            </div>

            <!-- Per-year table -->
            <div class="rounded-md border border-border/40 overflow-hidden">
              <table class="w-full text-xs">
                <thead class="bg-muted/20">
                  <tr>
                    <th class="text-left px-3 py-1.5">Year</th>
                    <th class="text-right px-3 py-1.5">Base</th>
                    <th class="text-right px-3 py-1.5">Bonus</th>
                    <th class="text-right px-3 py-1.5">Signing</th>
                    <th class="text-right px-3 py-1.5">Equity vested</th>
                    <th class="text-right px-3 py-1.5">Benefits</th>
                    <th class="text-right px-3 py-1.5 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {#each result.perYear as r}
                    <tr class="border-t border-border/20">
                      <td class="px-3 py-1.5 font-mono">Y{r.year}</td>
                      <td class="text-right px-3 py-1.5 font-mono">{fmt(r.base)}</td>
                      <td class="text-right px-3 py-1.5 font-mono">{fmt(r.bonus)}</td>
                      <td class="text-right px-3 py-1.5 font-mono">{fmt(r.signing)}</td>
                      <td class="text-right px-3 py-1.5 font-mono">{fmt(r.equityVested)}</td>
                      <td class="text-right px-3 py-1.5 font-mono">{fmt(r.benefits)}</td>
                      <td class="text-right px-3 py-1.5 font-mono font-semibold">{fmt(r.total)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Comparison -->
      {#if compareMode && comparison}
        <Card.Root class={cn(
          comparison.preferred === 'tied' ? 'border-muted' :
          comparison.preferred === 'a' ? 'border-emerald-500/40 bg-emerald-500/5' :
          'border-fuchsia-500/40 bg-fuchsia-500/5'
        )}>
          <Card.Header class="pb-2">
            <Card.Title class="text-base flex items-center gap-2">
              <Sparkles class="size-4 text-amber-400" />
              Side-by-side
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-2">
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div></div>
              <div class="font-medium text-center">Offer A</div>
              <div class="font-medium text-center">Offer B</div>

              <div class="text-muted-foreground">Year 1 cash</div>
              <div class="font-mono text-right">{fmt(comparison.a.year1Cash)}</div>
              <div class="font-mono text-right">{fmt(comparison.b.year1Cash)}</div>

              <div class="text-muted-foreground">4-yr nominal</div>
              <div class="font-mono text-right">{fmt(comparison.a.fourYearNominal)}</div>
              <div class="font-mono text-right">{fmt(comparison.b.fourYearNominal)}</div>

              <div class="text-muted-foreground">4-yr discounted</div>
              <div class="font-mono text-right">{fmt(comparison.a.fourYearDiscounted)}</div>
              <div class="font-mono text-right">{fmt(comparison.b.fourYearDiscounted)}</div>

              <div class="text-muted-foreground">Equity NPV</div>
              <div class="font-mono text-right">{fmt(comparison.a.equityNpv)}</div>
              <div class="font-mono text-right">{fmt(comparison.b.equityNpv)}</div>
            </div>
            <div class="pt-2 border-t border-border/30 text-sm">
              {#if comparison.preferred === 'tied'}
                <span class="text-muted-foreground">Within $100 — practical tie. Other factors (commute, growth, culture) should decide.</span>
              {:else}
                <span class={comparison.preferred === 'a' ? 'text-emerald-300' : 'text-fuchsia-300'}>
                  Offer {comparison.preferred.toUpperCase()} leads by
                  <strong class="font-mono">{fmt(comparison.delta)}</strong>
                  on {comparison.metric}.
                </span>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Disclaimer -->
      <div class="rounded-md border border-border/40 bg-muted/10 px-3 py-2 flex items-start gap-2">
        <Info class="size-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          Nominal numbers in your input currency, no inflation adjustment, no tax. For pre-IPO equity,
          set <em>Equity discount</em> generously (40-60%) — the 409A is almost always less than the
          eventual outcome but also less than the headline private valuation. Annual bonus is
          modeled at TARGET; companies hit 80-110% typically. Don't model refresh grants here —
          they're too speculative.
        </p>
      </div>
    </div>
  </div>
</div>
