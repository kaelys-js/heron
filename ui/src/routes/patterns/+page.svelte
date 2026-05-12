<!--
  /patterns — review + one-click apply rejection-pattern recommendations.

  Runs analyze-patterns.mjs server-side, surfaces the structured suggestions,
  and lets the user click "Apply" on each one. The mutation writes a .bak
  beside the target file so the user can revert manually if needed.

  Categories of suggestion the UI handles automatically:
    - Add negative keywords to portals.yml.title_filter.negative
    - Set profile.yml.automation.min_score_to_apply
    - Annotate _profile.md with [STRONG-FIT] / [AVOID] archetype tags
  Anything else is surfaced as 'manual' — the user reads the recommendation
  and decides what to do.
-->
<script lang="ts">
import Topbar from '$lib/components/Topbar.svelte';
import * as Card from '$lib/components/ui/card';
import { Button } from '$lib/components/ui/button';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  FileText,
  Sparkles,
  ChevronRight,
  Wrench,
} from '@lucide/svelte';
import { api, ApiError } from '$lib/api';
import { toast } from 'svelte-sonner';
import { invalidateAll } from '$app/navigation';
import { cn } from '$lib/utils';

type Suggestion = {
  id: string;
  action: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  op: string;
  payload?: Record<string, unknown>;
  targetFiles?: string[];
};

type Analysis = {
  metadata?: { total?: number };
  blockerAnalysis?: Array<{ blocker: string; frequency: number; percentage: number }>;
  techStackGaps?: Array<{ skill: string; frequency: number }>;
  scoreThreshold?: { recommended: number; reasoning: string };
} | null;

let {
  data,
}: {
  data: {
    profileId: string;
    analysis: Analysis;
    suggestions: Suggestion[];
  };
} = $props();

let applyingId = $state<string | null>(null);
// Track which suggestions have been applied this session so the UI can
// grey them out without a server-side persistent "applied" flag.
let appliedIds = $state(new Set<string>());

async function applyOne(s: Suggestion) {
  if (applyingId) return;
  if (s.op === 'manual') {
    toast.info('Manual recommendation', {
      description: 'Read the suggestion and edit the file yourself. ' + (s.targetFiles?.[0] ?? ''),
    });
    return;
  }
  applyingId = s.id;
  try {
    const r = await api.post<{
      ok: boolean;
      summary?: string;
      changedFiles?: string[];
      error?: string;
    }>('/api/patterns/suggestions?profile=' + encodeURIComponent(data.profileId), s, {
      silent: true,
    });
    if (r.ok) {
      toast.success('Applied', {
        description: r.summary + (r.changedFiles ? ' · ' + r.changedFiles.join(', ') : ''),
        duration: 8_000,
      });
      appliedIds.add(s.id);
      appliedIds = new Set(appliedIds);
      await invalidateAll();
    } else {
      toast.error('Apply failed', { description: r.error ?? 'unknown' });
    }
  } catch (e) {
    const err = e as ApiError;
    toast.error('Apply failed', { description: err.message });
  } finally {
    applyingId = null;
  }
}

function impactTint(i: string): string {
  if (i === 'high') return 'border-red-500/40 bg-red-500/5 text-red-200';
  if (i === 'medium') return 'border-amber-500/40 bg-amber-500/5 text-amber-200';
  return 'border-blue-500/30 bg-blue-500/5 text-blue-200';
}
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Patterns" subtitle="pattern analyzer recommendations" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-4xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="size-10 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40 flex items-center justify-center">
            <TrendingUp class="size-5 text-amber-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Pattern analyzer</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          analyze-patterns.mjs reads your applications.md + every report and surfaces concrete
          changes to portals.yml / _profile.md / automation thresholds that should improve your
          hit rate. Each suggestion is one-click-applyable; a <code class="font-mono text-[11px]">.bak</code>
          file is written alongside the target so you can revert by hand.
        </p>
      </div>

      <!-- Summary stats -->
      {#if data.analysis?.metadata?.total != null}
        <div class="rounded-md border border-border/40 bg-card px-3 py-2 flex items-center gap-4 flex-wrap text-xs">
          <span>
            Analyzed <span class="font-mono">{data.analysis.metadata.total}</span> applications
          </span>
          {#if data.analysis.scoreThreshold?.recommended}
            <span>· Recommended min score: <span class="font-mono">{data.analysis.scoreThreshold.recommended}/5</span></span>
          {/if}
        </div>
      {/if}

      <!-- Suggestions -->
      {#if data.suggestions.length === 0}
        <div class="rounded-md border border-dashed border-border/40 px-3 py-8 text-center">
          <Sparkles class="size-6 text-muted-foreground/60 mx-auto mb-2" />
          <p class="text-sm text-muted-foreground">
            No structured suggestions yet. You need a tracker with at least 2-3 applications +
            their reports for the analyzer to find patterns.
          </p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each data.suggestions as s (s.id)}
            {@const isApplied = appliedIds.has(s.id)}
            {@const isAutomatable = s.op !== 'manual'}
            <Card.Root class={cn(impactTint(s.impact), isApplied && 'opacity-60')}>
              <Card.Content class="py-3 space-y-2">
                <div class="flex items-start gap-3">
                  {#if isApplied}
                    <CheckCircle2 class="size-4 text-emerald-300 mt-0.5 flex-shrink-0" />
                  {:else}
                    <AlertTriangle class="size-4 mt-0.5 flex-shrink-0" />
                  {/if}
                  <div class="flex-1 min-w-0 space-y-1">
                    <div class="text-sm font-medium">{s.action}</div>
                    <p class="text-[11px] opacity-80 leading-relaxed">{s.reasoning}</p>
                    <div class="flex items-center gap-2 text-[10px] opacity-70 flex-wrap">
                      <span class="font-mono">impact: {s.impact}</span>
                      <span>·</span>
                      <span class="font-mono">{s.op}</span>
                      {#if s.targetFiles && s.targetFiles.length > 0}
                        <span>·</span>
                        <span class="font-mono truncate">{s.targetFiles[0]}</span>
                      {/if}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-[11px] gap-1.5"
                    onclick={() => applyOne(s)}
                    disabled={applyingId === s.id || isApplied || !isAutomatable}
                  >
                    {#if applyingId === s.id}
                      <Loader2 class="size-3 animate-spin" /> Applying…
                    {:else if isApplied}
                      Applied
                    {:else if isAutomatable}
                      <Wrench class="size-3" /> Apply
                    {:else}
                      <ChevronRight class="size-3" /> Manual
                    {/if}
                  </Button>
                </div>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      {/if}

      <!-- Footnote -->
      <div class="rounded-md border border-border/40 bg-muted/10 px-3 py-2 flex items-start gap-2">
        <Info class="size-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          Mutations write <code class="font-mono">{'<file>'}.bak</code> beside the target before
          modifying. To revert: <code class="font-mono">mv portals.yml.bak portals.yml</code>.
          The analyzer runs fresh on every page load — re-applying the same suggestion is a no-op
          when the change is already in place.
        </p>
      </div>
    </div>
  </div>
</div>
