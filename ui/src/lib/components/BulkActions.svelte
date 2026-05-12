<!--
  BulkActions — apply-to-all and generate-CV-for-all controls used by both
  the Inbox "Ready to apply" section and the Pipeline page.

  Responsibilities:
    * Two primary buttons: "Apply to all" / "Generate CVs for all"
    * Each opens a confirm Dialog with:
        - what's about to happen
        - per-source breakdown (LinkedIn auto vs Open & Mark for others)
        - explanation of how notifications + retry work
    * Submits to /api/bulk/apply or /api/bulk/cv and toasts the outcome.
    * For non-LinkedIn jobs in bulk apply, the response includes a list of
      `openInTabs` URLs which we open in new tabs (with a brief stagger so
      pop-up blockers don't kill them all).
-->
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import {
    Send,
    Wand2,
    Network as Linkedin,
    ArrowUpRight,
    FileBadge2,
    Loader2,
    AlertTriangle,
    Info,
    Bell,
    ListChecks,
    Sparkles,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration, cn } from '$lib/utils';
  import type { Job } from '$lib/types';

  let {
    /** Jobs eligible for bulk Apply (typically status === 'Ready'). */
    applyCandidates = [] as Job[],
    /** Jobs that should get a tailored CV (typically scored ≥4 without a PDF). */
    cvCandidates = [] as Job[],
    /** Visual size — use 'compact' for inline placement in pipeline header,
        'full' for the standalone Inbox bar. */
    size = 'compact' as 'compact' | 'full',
    /** Custom labels for the buttons (allows context-specific phrasing). */
    applyLabel = 'Apply to all',
    cvLabel = 'Generate tailored CVs',
  }: {
    applyCandidates?: Job[];
    cvCandidates?: Job[];
    size?: 'compact' | 'full';
    applyLabel?: string;
    cvLabel?: string;
  } = $props();

  // ---------- bulk-apply derived counts ----------
  let applyLinkedInCount = $derived(
    applyCandidates.filter((j) => /linkedin\.com/.test(j.url)).length,
  );
  let applyOtherCount = $derived(applyCandidates.length - applyLinkedInCount);
  let applyTotal = $derived(applyCandidates.length);

  // ---------- bulk CV derived counts ----------
  let cvAlreadyHave = $derived(cvCandidates.filter((j) => !!j.pdfFile).length);
  let cvWillRun = $derived(cvCandidates.length);

  let applyOpen = $state(false);
  let cvOpen = $state(false);
  let applyBusy = $state(false);
  let cvBusy = $state(false);

  // Open URLs in tabs with a 300ms stagger so pop-up blockers don't kill them.
  function openTabsStaggered(urls: string[]) {
    urls.forEach((u, i) => {
      setTimeout(() => window.open(u, '_blank', 'noopener'), i * 300);
    });
  }

  async function submitApply() {
    if (applyBusy || applyTotal === 0) return;
    applyBusy = true;
    try {
      const ids = applyCandidates.map((j) => j.id);
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          linkedInCount: number;
          otherCount: number;
          openInTabs: { id: string; url: string; company: string; role: string }[];
          message: string;
        }>('/api/bulk/apply', { jobIds: ids }, { silent: true }),
        500,
      );
      // Open non-LinkedIn URLs in new tabs (browser-side; server can't do this)
      if (r.openInTabs.length > 0) {
        openTabsStaggered(r.openInTabs.map((t) => t.url));
      }
      // Build a precise success line so the user knows exactly what happened.
      const parts: string[] = [];
      if (r.linkedInCount > 0) parts.push(r.linkedInCount + ' via LinkedIn (auto)');
      if (r.otherCount > 0) parts.push(r.otherCount + ' marked Applied + tabs opened');
      toast.success('Bulk apply running', {
        description:
          parts.join(' · ') +
          ' · Per-job events stream to the bell (top-right). Final summary toast pops when LinkedIn finishes. Failed jobs surface a Retry button.',
        duration: 10_000,
      });
      applyOpen = false;
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Bulk apply failed to start', {
        description:
          err.message + ' — no jobs were applied. Open Settings if a key is missing, then retry.',
        action: { label: 'Retry', onClick: () => submitApply() },
        duration: 12_000,
      });
    } finally {
      applyBusy = false;
    }
  }

  async function submitCv() {
    if (cvBusy || cvWillRun === 0) return;
    cvBusy = true;
    try {
      const ids = cvCandidates.map((j) => j.id);
      const r = await withMinDuration(
        api.post<{ ok: boolean; queued: number; message: string }>(
          '/api/bulk/cv',
          { jobIds: ids },
          { silent: true },
        ),
        500,
      );
      toast.success('Bulk CV started · ' + r.queued + ' queued', {
        description:
          'Sequential — each job logs "Bulk CV n/N" to the bell, then "Generate CV finished" or "failed" with retry. Final summary: "X generated · Y failed".',
        duration: 10_000,
      });
      cvOpen = false;
    } catch (e) {
      const err = e as ApiError;
      toast.error('Bulk CV failed to start', {
        description:
          err.message + ' — Claude Code CLI must be on PATH and a session must be active.',
        action: { label: 'Retry', onClick: () => submitCv() },
        duration: 12_000,
      });
    } finally {
      cvBusy = false;
    }
  }
</script>

{#if applyTotal > 0 || cvWillRun > 0}
  <div
    class={cn(
      'flex items-center gap-2 flex-wrap',
      size === 'full' && 'rounded-md border border-border/40 bg-muted/30 px-3 py-2',
    )}
  >
    {#if size === 'full'}
      <ListChecks class="size-4 text-muted-foreground/80 flex-shrink-0" />
      <span class="text-xs font-medium">Bulk actions</span>
      <div class="flex-1"></div>
    {/if}

    {#if applyTotal > 0}
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="default"
                size="sm"
                class="h-8 gap-1.5"
                onclick={() => (applyOpen = true)}
              >
                <Send class="size-3.5" />
                <span>{applyLabel}</span>
                <span class="text-[11px] opacity-80 font-mono">{applyTotal}</span>
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs max-w-xs">
            Apply to all {applyTotal} job{applyTotal === 1 ? '' : 's'} —
            {applyLinkedInCount} via LinkedIn auto + {applyOtherCount} marked Applied with browser tabs
            opened.
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}

    {#if cvWillRun > 0}
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                class="h-8 gap-1.5"
                onclick={() => (cvOpen = true)}
              >
                <Wand2 class="size-3.5" />
                <span>{cvLabel}</span>
                <span class="text-[11px] opacity-80 font-mono">{cvWillRun}</span>
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs max-w-xs">
            Run Claude oferta on all {cvWillRun} job{cvWillRun === 1 ? '' : 's'} (sequentially, ~1–3 min
            each).
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}
  </div>
{/if}

<!-- ============ APPLY DIALOG ============ -->
<Dialog.Root bind:open={applyOpen}>
  <Dialog.Content class="sm:max-w-lg p-0 gap-0 overflow-hidden">
    <Dialog.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-lg bg-foreground/5 ring-1 ring-border flex items-center justify-center flex-shrink-0"
        >
          <Send class="size-4 text-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <Dialog.Title class="text-base">Apply to {applyTotal} jobs</Dialog.Title>
          <Dialog.Description class="text-xs mt-0.5">
            Splits the queue across two paths so each job gets the right treatment.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="px-5 py-4 space-y-3">
      <!-- LinkedIn group -->
      <div
        class={cn(
          'rounded-md border p-3 flex items-start gap-3',
          applyLinkedInCount > 0
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-border/30 bg-muted/20 opacity-60',
        )}
      >
        <Linkedin
          class={cn(
            'size-4 mt-0.5 flex-shrink-0',
            applyLinkedInCount > 0 ? 'text-blue-400' : 'text-muted-foreground/60',
          )}
        />
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium">{applyLinkedInCount} LinkedIn Easy Apply</span>
            <span class="text-[11px] text-muted-foreground/70">automated</span>
          </div>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
            Playwright fills these in headed mode — you can watch and click Submit yourself. They
            run sequentially (rate limits + safety).
          </p>
        </div>
      </div>

      <!-- Other group -->
      <div
        class={cn(
          'rounded-md border p-3 flex items-start gap-3',
          applyOtherCount > 0
            ? 'border-violet-500/30 bg-violet-500/5'
            : 'border-border/30 bg-muted/20 opacity-60',
        )}
      >
        <ArrowUpRight
          class={cn(
            'size-4 mt-0.5 flex-shrink-0',
            applyOtherCount > 0 ? 'text-violet-400' : 'text-muted-foreground/60',
          )}
        />
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium">{applyOtherCount} non-LinkedIn — Open &amp; Mark</span
            >
            <span class="text-[11px] text-muted-foreground/70">manual fill</span>
          </div>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
            We open each posting in a new tab (300ms stagger so your browser doesn't block) and flip
            the tracker to Applied. You finish the form on each company's site.
          </p>
        </div>
      </div>

      <!-- Notifications explainer -->
      <div class="rounded-md border border-border/40 bg-muted/30 p-3 flex items-start gap-2">
        <Bell class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div class="flex-1 min-w-0 space-y-1">
          <div class="text-[11px] font-medium">How you'll be notified</div>
          <ul
            class="text-[11px] text-muted-foreground/80 leading-relaxed space-y-0.5 list-disc list-inside"
          >
            <li>Activity feed (bell, top-right) gets a "Bulk apply ↦" event per job.</li>
            <li>Toast pops with the per-step outcome.</li>
            <li>
              If anything fails, the failure toast shows a <span class="font-medium text-foreground"
                >Retry</span
              > button.
            </li>
            <li>Final summary toast: "X applied · Y failed".</li>
          </ul>
        </div>
      </div>

      {#if applyOtherCount > 5}
        <div
          class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2"
        >
          <AlertTriangle class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-amber-200/90 leading-relaxed">
            Browsers may block more than ~5 simultaneous tab opens. If you see fewer tabs than
            expected, allow pop-ups for this site and re-run for the missing rows.
          </p>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="px-5 py-3 border-t bg-muted/20">
      <Button variant="ghost" onclick={() => (applyOpen = false)} disabled={applyBusy}
        >Cancel</Button
      >
      <Button onclick={submitApply} disabled={applyBusy || applyTotal === 0} class="gap-1.5">
        {#if applyBusy}
          <Loader2 class="size-3.5 animate-spin" />
          Starting…
        {:else}
          <Send class="size-3.5" />
          Apply to {applyTotal}
          {applyTotal === 1 ? 'job' : 'jobs'}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ============ BULK CV DIALOG ============ -->
<Dialog.Root bind:open={cvOpen}>
  <Dialog.Content class="sm:max-w-lg p-0 gap-0 overflow-hidden">
    <Dialog.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-lg bg-foreground/5 ring-1 ring-border flex items-center justify-center flex-shrink-0"
        >
          <Wand2 class="size-4 text-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <Dialog.Title class="text-base"
            >Generate {cvWillRun} tailored CV{cvWillRun === 1 ? '' : 's'}</Dialog.Title
          >
          <Dialog.Description class="text-xs mt-0.5">
            Spawns Claude Code's <code class="font-mono">oferta</code> mode for each job, sequentially.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="px-5 py-4 space-y-3">
      <div class="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
        <div class="flex items-baseline gap-2">
          <Sparkles class="size-3.5 text-amber-400" />
          <span class="text-sm font-medium">What you get per job</span>
        </div>
        <ul
          class="text-[11px] text-muted-foreground/80 leading-relaxed space-y-0.5 list-disc list-inside ml-1"
        >
          <li>Deep evaluation report (7-block A–G) in <span class="font-mono">reports/</span></li>
          <li>Tailored CV PDF in <span class="font-mono">output/</span></li>
          <li>Status auto-promoted to Ready</li>
        </ul>
        <p class="text-[11px] text-muted-foreground/70 pt-1">
          Roughly 1–3 minutes per job. {cvWillRun} jobs → estimated {Math.max(
            1,
            Math.ceil(cvWillRun * 1.5),
          )}–{cvWillRun * 3} minutes.
        </p>
      </div>

      {#if cvAlreadyHave > 0}
        <div
          class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2"
        >
          <AlertTriangle class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-amber-200/90 leading-relaxed">
            {cvAlreadyHave} of these already have a CV PDF. Running again will regenerate them.
          </p>
        </div>
      {/if}

      <!-- Notifications explainer -->
      <div class="rounded-md border border-border/40 bg-muted/30 p-3 flex items-start gap-2">
        <Bell class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div class="flex-1 min-w-0 space-y-1">
          <div class="text-[11px] font-medium">How you'll be notified</div>
          <ul
            class="text-[11px] text-muted-foreground/80 leading-relaxed space-y-0.5 list-disc list-inside"
          >
            <li>Each job logs a "Bulk CV n/N" event to the activity feed.</li>
            <li>
              Each report and PDF appears in <span class="font-mono">reports/</span> +
              <span class="font-mono">output/</span>.
            </li>
            <li>Final toast: "X generated · Y failed".</li>
            <li>If a job fails, the toast shows a Retry button.</li>
          </ul>
        </div>
      </div>

      <div class="rounded-md border border-border/40 bg-muted/20 p-3 flex items-start gap-2">
        <Info class="size-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          Requires <span class="font-mono text-foreground">claude</span> on PATH and an active session.
          If you use a different CLI (Gemini / Codex / OpenCode), the orchestrator may not pick it up
          — pin Claude Code for this feature.
        </p>
      </div>
    </div>

    <Dialog.Footer class="px-5 py-3 border-t bg-muted/20">
      <Button variant="ghost" onclick={() => (cvOpen = false)} disabled={cvBusy}>Cancel</Button>
      <Button onclick={submitCv} disabled={cvBusy || cvWillRun === 0} class="gap-1.5">
        {#if cvBusy}
          <Loader2 class="size-3.5 animate-spin" />
          Starting…
        {:else}
          <FileBadge2 class="size-3.5" />
          Generate {cvWillRun} CV{cvWillRun === 1 ? '' : 's'}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
