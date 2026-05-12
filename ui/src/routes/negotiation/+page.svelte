<!--
  /negotiation — the structured playbook for verbal → signed.

  4 sections, each a self-contained card:
    1. "You just got a verbal offer" — the 5-step do-not-screw-up checklist
       (covers #4 don't-accept-verbally)
    2. Decision tree — if-they-say-X-you-say-Y scripts grouped by situation
       (covers #8 negotiation tree, #11 multi-offer, #19 exploding)
    3. Non-comp ask checklist — title, remote, start, refresh, IP carve-out
       (covers #12)
    4. Tier comp bands — rough sanity check that "is this offer below band?"
       (covers #20)

  Static structured data, rendered server-side. No Claude calls — the
  user reads this WHILE on the call with the recruiter, where there's
  no time for a 60-second LLM round-trip.
-->
<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import {
    DollarSign,
    MessageSquare,
    CheckSquare,
    TrendingUp,
    AlertTriangle,
    ArrowRight,
    ShieldAlert,
    BookOpen,
    ListChecks,
    Sparkles,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  type Branch = { trigger: string; response: string; rationale: string; nextLikely?: string };
  type NonCompAsk = { category: string; ask: string; why: string; difficulty: 1 | 2 | 3 };
  type CompBand = { band: string; base: [number, number]; total: [number, number]; notes: string };

  let {
    data,
  }: {
    data: {
      playbook: {
        decisionTree: Record<string, Branch[]>;
        nonCompAsks: NonCompAsk[];
        dontAcceptVerbally: { title: string; steps: string[]; redFlags: string[] };
        tierBands: Record<string, CompBand>;
      };
    };
  } = $props();

  // Decision-tree current section. Default to verbal-offer (entry point).
  let activeBranch = $state('verbal-offer');
  let branchKeys = $derived(Object.keys(data.playbook.decisionTree));

  function fmtMoney(n: number): string {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + n;
  }

  function difficultyTint(d: 1 | 2 | 3): string {
    if (d === 1) return 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200';
    if (d === 2) return 'border-amber-500/40 bg-amber-500/5 text-amber-200';
    return 'border-red-500/40 bg-red-500/5 text-red-200';
  }
  function difficultyLabel(d: 1 | 2 | 3): string {
    if (d === 1) return 'easy';
    if (d === 2) return 'medium';
    return 'hard';
  }

  // Group non-comp asks by category for cleaner rendering.
  let asksByCategory = $derived.by(() => {
    const m = new Map<string, NonCompAsk[]>();
    for (const a of data.playbook.nonCompAsks) {
      if (!m.has(a.category)) m.set(a.category, []);
      m.get(a.category)!.push(a);
    }
    return [...m.entries()];
  });
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Negotiation playbook" subtitle="verbal → signed" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-4xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/40 flex items-center justify-center"
          >
            <DollarSign class="size-5 text-emerald-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Negotiation playbook</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Read this BEFORE the verbal-offer call. Most candidates leave 10-30% on the table here
          because the conversation moves fast and they haven't pre-loaded responses. Four sections
          below cover the do-not-screw-up checklist, an if-they-say-X-you-say-Y decision tree, a
          non-comp asks checklist, and rough tier-comp bands for sanity check.
        </p>
        <div class="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" href="/comp-eval" class="gap-1.5">
            <DollarSign class="size-3" /> Comp calculator
          </Button>
        </div>
      </div>

      <!-- #4: "Don't accept verbally" -->
      <Card.Root class="border-amber-500/40 bg-amber-500/5">
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <ShieldAlert class="size-4 text-amber-300" />
            {data.playbook.dontAcceptVerbally.title}
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3">
          <ol class="list-decimal pl-5 space-y-1.5 text-xs text-amber-100/90 leading-relaxed">
            {#each data.playbook.dontAcceptVerbally.steps as step}
              <li>{step}</li>
            {/each}
          </ol>
          <div class="pt-2 border-t border-amber-500/20">
            <h3
              class="text-[11px] uppercase tracking-wider text-amber-300/80 flex items-center gap-1 mb-1"
            >
              <AlertTriangle class="size-3" />
              Red flags that should make you WALK
            </h3>
            <ul class="list-disc pl-5 space-y-0.5 text-[11px] text-amber-100/80">
              {#each data.playbook.dontAcceptVerbally.redFlags as flag}
                <li>{flag}</li>
              {/each}
            </ul>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- #8 + #11 + #19: Decision tree -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <MessageSquare class="size-4 text-emerald-400" />
            If they say X, you say Y
          </Card.Title>
          <Card.Description class="text-xs">
            Scripts for the most common moves the other side will make. Pick the situation, read the
            response + rationale. Adapt wording to your voice — the STRUCTURE is the value.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          <!-- Situation picker -->
          <div class="flex items-center gap-1.5 flex-wrap">
            {#each branchKeys as key}
              <button
                type="button"
                onclick={() => (activeBranch = key)}
                class={cn(
                  'px-2 py-1 rounded text-[11px] font-mono border transition',
                  activeBranch === key
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                    : 'border-border/40 bg-card text-muted-foreground hover:border-border',
                )}>{key}</button
              >
            {/each}
          </div>

          <!-- Active branch -->
          <div class="space-y-2">
            {#each data.playbook.decisionTree[activeBranch] ?? [] as branch, i (i)}
              <div class="rounded-md border border-border/40 bg-card px-3 py-2.5 space-y-1.5">
                <div
                  class="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"
                >
                  <ArrowRight class="size-3 text-red-300" />
                  They say
                </div>
                <p
                  class="text-xs italic text-red-200/90 leading-relaxed pl-4 border-l-2 border-red-500/30"
                >
                  "{branch.trigger}"
                </p>
                <div
                  class="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 pt-1"
                >
                  <ArrowRight class="size-3 text-emerald-300" />
                  You say
                </div>
                <p
                  class="text-xs text-emerald-100/95 leading-relaxed pl-4 border-l-2 border-emerald-500/30"
                >
                  {branch.response}
                </p>
                <div
                  class="text-[11px] uppercase tracking-wider text-muted-foreground pt-1 flex items-center gap-1"
                >
                  <Sparkles class="size-2.5 text-amber-300" />
                  Why
                </div>
                <p class="text-[11px] text-muted-foreground leading-relaxed pl-4">
                  {branch.rationale}
                </p>
                {#if branch.nextLikely}
                  <p class="text-[11px] text-muted-foreground/70 pt-1">
                    Next likely: <button
                      type="button"
                      onclick={() => (activeBranch = branch.nextLikely!)}
                      class="font-mono underline underline-offset-2 hover:text-foreground"
                      >{branch.nextLikely}</button
                    >
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>

      <!-- #12: Non-comp asks checklist -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <CheckSquare class="size-4 text-emerald-400" />
            Non-comp asks · the levers most candidates forget
          </Card.Title>
          <Card.Description class="text-xs">
            When base is locked, these are the wins. Each is tagged by difficulty (easy = usually
            yes if you ask, hard = needs serious leverage).
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#each asksByCategory as [category, items]}
            <div class="space-y-1">
              <h3 class="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                {category}
              </h3>
              {#each items as ask}
                <div
                  class={cn(
                    'rounded-md border px-3 py-2 space-y-0.5',
                    difficultyTint(ask.difficulty),
                  )}
                >
                  <div class="flex items-start gap-2">
                    <span class="text-[11px] font-mono uppercase opacity-70"
                      >{difficultyLabel(ask.difficulty)}</span
                    >
                    <p class="text-xs flex-1">{ask.ask}</p>
                  </div>
                  <p class="text-[11px] opacity-80 pl-12 leading-relaxed">{ask.why}</p>
                </div>
              {/each}
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- #20: Tier comp bands -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <TrendingUp class="size-4 text-emerald-400" />
            Tier comp bands · is the offer below band?
          </Card.Title>
          <Card.Description class="text-xs">
            Rough sanity-check ranges by company tier (US, 2024-2025). Refine via
            <a href="https://levels.fyi" target="_blank" class="underline">levels.fyi</a> for the specific
            company × role × location.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each Object.entries(data.playbook.tierBands) as [key, band]}
            <div class="rounded-md border border-border/40 bg-card px-3 py-2 space-y-0.5">
              <div class="text-xs font-medium">{band.band}</div>
              <div class="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                <span
                  >Base <span class="font-mono text-foreground"
                    >{fmtMoney(band.base[0])}-{fmtMoney(band.base[1])}</span
                  ></span
                >
                <span>·</span>
                <span
                  >Total <span class="font-mono text-foreground"
                    >{fmtMoney(band.total[0])}-{fmtMoney(band.total[1])}</span
                  ></span
                >
              </div>
              <p class="text-[11px] text-muted-foreground/70 leading-relaxed">{band.notes}</p>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- Footer -->
      <div class="rounded-md border border-border/40 bg-muted/10 px-3 py-2 flex items-start gap-2">
        <BookOpen class="size-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          For a per-job tailored brief (rather than the generic playbook), use the job detail page's
          "Negotiation brief" action — it spawns Claude with cv.md + report + offer specifics. This
          playbook covers the conversation structure that no LLM call can reliably produce in
          real-time.
        </p>
      </div>
    </div>
  </div>
</div>
