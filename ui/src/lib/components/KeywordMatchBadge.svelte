<!--
  KeywordMatchBadge — auto-fetches the JD ⇄ CV keyword-overlap score for
  a job and renders a compact badge. Hidden when no deep-eval report
  exists yet (the JD source is the report).

  Click the badge to expand the "missing keywords" list — those are the
  terms the user should consider weaving into their CV before applying
  (only if true, never fabricated).
-->
<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { Target, ChevronDown, AlertTriangle, CheckCircle2 } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';

  let { jobId, profileId }: { jobId: string; profileId?: string } = $props();

  type MatchResult = {
    hasReport: boolean;
    score: number | null;
    matched: string[] | null;
    missing: string[] | null;
    considered: { unigrams: number; bigrams: number; trigrams: number } | null;
  };

  let result = $state<MatchResult | null>(null);
  let loading = $state(true);

  let scoreTint = $derived.by(() => {
    const s = result?.score ?? 0;
    if (s >= 80) return 'text-success border-success/40 bg-success/10';
    if (s >= 60) return 'text-warning border-warning/40 bg-warning/10';
    return 'text-destructive border-destructive/40 bg-destructive/10';
  });

  let bandLabel = $derived.by(() => {
    const s = result?.score ?? 0;
    if (s >= 80) return 'Strong';
    if (s >= 60) return 'Decent';
    if (s >= 40) return 'Thin';
    return 'Weak';
  });

  onMount(async () => {
    try {
      const pq = profileId ? '?profile=' + encodeURIComponent(profileId) : '';
      const r = await api.get<MatchResult>(
        '/api/job/' + encodeURIComponent(jobId) + '/keyword-match' + pq,
        { silent: true },
      );
      result = r;
    } catch {
      result = null;
    } finally {
      loading = false;
    }
  });
</script>

{#if !loading && result?.hasReport && result.score != null}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium hover:brightness-110 transition',
            scoreTint,
          )}
        >
          <Target class="size-3" />
          <span>ATS match: <strong class="font-mono">{result?.score ?? 0}%</strong></span>
          <span class="opacity-70">· {bandLabel}</span>
          <ChevronDown class="size-3 opacity-60" />
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-96 p-0">
      <div class="px-3 py-2 border-b border-border/40 space-y-0.5">
        <div class="text-xs font-medium flex items-center gap-1.5">
          <Target class="size-3 text-fuchsia-700 dark:text-fuchsia-400" />
          JD ⇄ CV keyword overlap
        </div>
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          {result.considered?.unigrams ?? 0} terms · {result.considered?.bigrams ?? 0} bigrams ·
          {result.considered?.trigrams ?? 0} trigrams scanned. Weighted 1× / 2× / 3× respectively.
        </p>
      </div>
      <div class="max-h-80 overflow-y-auto p-3 space-y-3">
        {#if result.missing && result.missing.length > 0}
          <div>
            <div
              class="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"
            >
              <AlertTriangle class="size-3 text-warning" />
              Missing ({result.missing.length})
            </div>
            <div class="flex flex-wrap gap-1">
              {#each result.missing.slice(0, 50) as term}
                <span
                  class="text-[11px] px-1.5 py-0.5 rounded border border-warning/30 bg-warning/5 text-warning"
                  >{term}</span
                >
              {/each}
              {#if result.missing.length > 50}
                <span class="text-[11px] text-muted-foreground"
                  >+{result.missing.length - 50} more</span
                >
              {/if}
            </div>
            <p class="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
              Consider weaving these into your CV — but only when true. Never fabricate experience.
              The strongest moves are usually the 2-3 word phrases at the top.
            </p>
          </div>
        {/if}
        {#if result.matched && result.matched.length > 0}
          <div>
            <div
              class="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"
            >
              <CheckCircle2 class="size-3 text-success" />
              Matched ({result.matched.length})
            </div>
            <div class="flex flex-wrap gap-1">
              {#each result.matched.slice(0, 40) as term}
                <span
                  class="text-[11px] px-1.5 py-0.5 rounded border border-success/30 bg-success/5 text-success"
                  >{term}</span
                >
              {/each}
              {#if result.matched.length > 40}
                <span class="text-[11px] text-muted-foreground"
                  >+{result.matched.length - 40} more</span
                >
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}
