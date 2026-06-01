<!--
  CvQualityCard — renders ATS + resume-quality scores for the user's
  base CV, with one-click auto-fix.

  Flow:
    1. On mount → POST /api/profile/cv-check (cheap; <1s)
    2. Show scores as badges + a list of failed checks
    3. If any fails → show "Auto-fix with AI" button → POST /api/profile/cv-fix
       (preview mode first; user confirms apply)

  Used in profile/+page.svelte and onboarding/cv/+page.svelte.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { CheckCircle2, AlertTriangle, XCircle, Wand2, Loader2, RefreshCw } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';

  type FailedCheck = { status: 'fail' | 'warn' | 'pass'; name: string; evidence: string };
  type CheckResponse = {
    ok: boolean;
    hasCv: boolean;
    hasPdf?: boolean;
    atsScore?: number;
    qualityScore?: number;
    atsFailSummary?: string;
    qualityFailSummary?: string;
    atsFailedChecks?: FailedCheck[];
    qualityFailedChecks?: FailedCheck[];
    message?: string;
  };

  let { onCvUpdated }: { onCvUpdated?: () => void } = $props();

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let result = $state<CheckResponse | null>(null);
  let fixing = $state(false);
  let previewing = $state(false);
  let fixPreview = $state<{ before: string; after: string } | null>(null);

  async function runCheck() {
    status = 'loading';
    try {
      const r = await api.post<CheckResponse>('/api/profile/cv-check', {});
      result = r;
      status = 'ready';
    } catch {
      status = 'error';
    }
  }
  onMount(runCheck);

  async function previewFix() {
    previewing = true;
    try {
      const r = await api.post<{
        ok: boolean;
        before: string;
        after: string;
        qualityScoreAfter?: number;
        qualityFailSummaryAfter?: string;
      }>('/api/profile/cv-fix', { apply: false });
      if (r.ok) fixPreview = { before: r.before, after: r.after };
    } finally {
      previewing = false;
    }
  }

  async function applyFix() {
    fixing = true;
    try {
      const r = await api.post<{ ok: boolean; backedUp: boolean }>('/api/profile/cv-fix', {
        apply: true,
      });
      if (r.ok) {
        fixPreview = null;
        await runCheck();
        onCvUpdated?.();
      }
    } finally {
      fixing = false;
    }
  }

  function scoreColor(score?: number): string {
    if (score == null) return 'bg-muted text-muted-foreground';
    if (score === 100) return 'bg-success/15 text-success border-success/40';
    if (score >= 90) return 'bg-info/15 text-info border-info/40';
    if (score >= 75) return 'bg-warning/15 text-warning border-warning/40';
    return 'bg-destructive/15 text-destructive border-destructive/40';
  }
</script>

<Card.Root class="p-5">
  <div class="flex items-start justify-between gap-3 mb-3">
    <div>
      <h3 class="text-base font-semibold flex items-center gap-2">
        <CheckCircle2 class="size-4 text-success" /> CV Quality
      </h3>
      <p class="text-xs text-muted-foreground mt-0.5">
        Strict ATS lint + AI-detection scan on your base CV. Every submitted resume runs through
        this gate.
      </p>
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      onclick={runCheck}
      disabled={status === 'loading'}
      aria-label="Re-run CV quality check"
    >
      {#if status === 'loading'}
        <Loader2 class="size-3.5 animate-spin" />
      {:else}
        <RefreshCw class="size-3.5" />
      {/if}
    </Button>
  </div>

  {#if status === 'loading'}
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 class="size-3.5 animate-spin" /> Running checks…
    </div>
  {:else if status === 'error'}
    <div class="text-sm text-destructive flex items-center gap-2">
      <XCircle class="size-3.5" /> Quality check failed — see activity log.
    </div>
  {:else if result && !result.hasCv}
    <div class="text-sm text-warning flex items-center gap-2">
      <AlertTriangle class="size-3.5" /> No cv.md yet — paste your CV via the CV manager.
    </div>
  {:else if result}
    <!-- Score badges -->
    <div class="flex flex-wrap gap-2 mb-3">
      <Badge
        variant="outline"
        class={cn('text-xs px-2.5 py-0.5 font-mono', scoreColor(result.qualityScore))}
      >
        Quality {result.qualityScore != null ? `${result.qualityScore.toFixed(1)}%` : '—'}
      </Badge>
      <Badge
        variant="outline"
        class={cn('text-xs px-2.5 py-0.5 font-mono', scoreColor(result.atsScore))}
      >
        ATS {result.atsScore != null
          ? `${result.atsScore.toFixed(1)}%`
          : result.hasPdf
            ? '—'
            : 'no PDF yet'}
      </Badge>
    </div>

    <!-- Failed checks -->
    {#if (result.qualityFailedChecks?.length ?? 0) > 0 || (result.atsFailedChecks?.length ?? 0) > 0}
      <div class="space-y-1.5 text-xs mb-3">
        {#if result.qualityFailedChecks && result.qualityFailedChecks.length > 0}
          <p class="text-muted-foreground font-medium mt-1">Quality fails:</p>
          {#each result.qualityFailedChecks as c}
            <div class="flex gap-2 items-start">
              <XCircle class="size-3 text-destructive mt-0.5 shrink-0" />
              <div>
                <span class="font-medium">{c.name}</span>
                {#if c.evidence}<span class="text-muted-foreground"> — {c.evidence}</span>{/if}
              </div>
            </div>
          {/each}
        {/if}
        {#if result.atsFailedChecks && result.atsFailedChecks.length > 0}
          <p class="text-muted-foreground font-medium mt-2">ATS fails:</p>
          {#each result.atsFailedChecks as c}
            <div class="flex gap-2 items-start">
              <XCircle class="size-3 text-destructive mt-0.5 shrink-0" />
              <div>
                <span class="font-medium">{c.name}</span>
                {#if c.evidence}<span class="text-muted-foreground"> — {c.evidence}</span>{/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Auto-fix CTA -->
      {#if !fixPreview}
        <Button
          variant="outline"
          size="sm"
          class="h-7 text-xs gap-1.5 border-info/40 hover:bg-info/10"
          onclick={previewFix}
          disabled={previewing}
        >
          {#if previewing}
            <Loader2 class="size-3 animate-spin" /> Generating fix…
          {:else}
            <Wand2 class="size-3 text-info" /> Auto-fix with AI (preview)
          {/if}
        </Button>
        <p class="text-[11px] text-muted-foreground mt-1.5">
          AI rewrites the CV preserving every fact, removing AI-detection patterns + clichés. The
          original is backed up to <code class="font-mono">cv.md.bak</code> before any change.
        </p>
      {:else}
        <div class="border border-info/30 rounded-lg p-3 bg-info/5 text-xs">
          <p class="font-medium text-info mb-2">Preview ready</p>
          <details class="mb-2">
            <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
              Show diff (before / after)
            </summary>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <pre
                class="text-[9px] font-mono whitespace-pre-wrap max-h-48 overflow-auto bg-background p-2 rounded">{fixPreview.before.slice(
                  0,
                  800,
                )}{fixPreview.before.length > 800 ? '\n…' : ''}</pre>
              <pre
                class="text-[9px] font-mono whitespace-pre-wrap max-h-48 overflow-auto bg-background p-2 rounded">{fixPreview.after.slice(
                  0,
                  800,
                )}{fixPreview.after.length > 800 ? '\n…' : ''}</pre>
            </div>
          </details>
          <div class="flex gap-2">
            <Button
              size="sm"
              class="h-7 text-xs gap-1.5 bg-blue-500 hover:bg-blue-600 text-white"
              onclick={applyFix}
              disabled={fixing}
            >
              {#if fixing}
                <Loader2 class="size-3 animate-spin" /> Applying…
              {:else}
                <Wand2 class="size-3" /> Apply fix
              {/if}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="h-7 text-xs"
              onclick={() => (fixPreview = null)}
              disabled={fixing}
            >
              Cancel
            </Button>
          </div>
        </div>
      {/if}
    {:else}
      <div class="text-xs text-success flex items-center gap-2">
        <CheckCircle2 class="size-3.5" /> Every check passes — your CV is ready for any ATS.
      </div>
    {/if}
  {/if}
</Card.Root>
