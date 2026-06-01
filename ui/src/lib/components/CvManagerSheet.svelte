<!--
  CV Manager — single sheet that handles all four CV actions:

    * View      -- read-only rendered markdown of cv.md
    * Edit      -- in-place editor with Save → PUT /api/profile/file/cv
    * Replace   -- paste a new CV; backs up the existing one to cv.md.bak
    * Reprocess -- runs Claude over cv.md and emits a ProfileEdit suggestion
                   (parent merges it into local edit state — never auto-saved)

  The sheet talks to two endpoints:
    GET  /api/profile/file/cv      → reads body
    PUT  /api/profile/file/cv      → writes body (with .bak)
    POST /api/profile/reprocess    → returns { suggestion }

  Every async transition produces a toast (success or error with retry) and is
  also logged server-side so the bell shows an audit entry per change.
-->
<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import {
    Eye,
    Pencil,
    ReplaceAll,
    Wand2,
    FileText,
    AlertTriangle,
    Loader2,
    Save,
    Download,
    Copy,
    Check,
    Info,
    Sparkles,
    RotateCcw,
  } from '@lucide/svelte';
  import { renderMarkdown } from '$lib/client/safe-markdown';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration, cn } from '$lib/utils';
  import type { ProfileEdit } from '$lib/server/profile';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  type Tab = 'view' | 'edit' | 'replace' | 'reprocess';
  type Suggestion = {
    candidate?: NonNullable<ProfileEdit['candidate']>;
    narrative?: NonNullable<ProfileEdit['narrative']>;
    location?: NonNullable<ProfileEdit['location']>;
  };

  let {
    open = $bindable(false),
    initialTab = 'view' as Tab,
    onApplySuggestion,
  }: {
    open?: boolean;
    initialTab?: Tab;
    /** Parent merges this into its local ProfileEdit state and marks the form dirty. */
    onApplySuggestion?: (suggestion: Suggestion) => void;
  } = $props();

  // svelte-ignore state_referenced_locally -- `initialTab` is the seed only;
  // the $effect below resyncs whenever the sheet re-opens.
  let activeTab = $state<Tab>(initialTab);

  // ---- shared state ----
  let body = $state(''); // current cv.md content
  let bodyLoading = $state(false);
  let bodyError = $state<string | null>(null);

  // edit mode (in-place editor with own discard confirm)
  let editDraft = $state('');
  let editBusy = $state(false);
  let editDirty = $derived(editDraft !== body);
  const confirmEditDiscard = new ConfirmGate();
  onDestroy(() => confirmEditDiscard.destroy());
  let editDiscardArmed = $derived(confirmEditDiscard.isArmed('edit-discard'));
  function discardEdit() {
    if (!confirmEditDiscard.trigger('edit-discard')) return;
    editDraft = body;
  }

  // replace mode (confirm via shared ConfirmGate so it matches every other
  // destructive action in the app)
  let replaceDraft = $state('');
  let replaceBusy = $state(false);
  const confirmReplace = new ConfirmGate();
  onDestroy(() => confirmReplace.destroy());
  let replaceArmed = $derived(confirmReplace.isArmed('replace'));

  // reprocess mode
  let reprocessBusy = $state(false);
  let suggestion = $state<Suggestion | null>(null);
  let reprocessError = $state<string | null>(null);
  const confirmReprocessDiscard = new ConfirmGate();
  onDestroy(() => confirmReprocessDiscard.destroy());
  let reprocessDiscardArmed = $derived(confirmReprocessDiscard.isArmed('reprocess-discard'));
  function discardSuggestion() {
    if (!confirmReprocessDiscard.trigger('reprocess-discard')) return;
    suggestion = null;
  }

  // Reset everything when the sheet closes; reload body on every open.
  $effect(() => {
    if (open) {
      activeTab = initialTab;
      void loadBody();
    } else {
      // Defer reset to next tick so the close animation doesn't flash empty content
      setTimeout(() => {
        body = '';
        editDraft = '';
        replaceDraft = '';
        confirmReplace.disarm();
        suggestion = null;
        bodyError = null;
        reprocessError = null;
      }, 250);
    }
  });

  async function loadBody() {
    bodyLoading = true;
    bodyError = null;
    try {
      const r = await api.get<{ body: string }>('/api/profile/file/cv', { silent: true });
      body = r.body;
      editDraft = r.body;
    } catch (e) {
      const err = e as ApiError;
      bodyError = err.message;
      // Don't toast -- bodyError renders inline
    } finally {
      bodyLoading = false;
    }
  }

  async function saveEdit() {
    if (!editDirty || editBusy) return;
    editBusy = true;
    try {
      const r = await withMinDuration(
        api.put<{ bytes: number; backedUp: boolean }>(
          '/api/profile/file/cv',
          { content: editDraft },
          { silent: true },
        ),
        500,
      );
      body = editDraft;
      toast.success('CV saved', {
        description:
          (r.bytes / 1024).toFixed(1) +
          ' KB written' +
          (r.backedUp ? ' · previous version backed up to cv.md.bak' : '') +
          '. Run Reprocess if you want to refresh the profile fields.',
        duration: 6_000,
      });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('CV save failed', {
        description: err.message + ' — your edits are still in this textarea, retry to save.',
        action: { label: 'Retry', onClick: () => saveEdit() },
        duration: 12_000,
      });
    } finally {
      editBusy = false;
    }
  }

  async function submitReplace() {
    if (replaceBusy || !replaceDraft.trim()) return;
    if (!confirmReplace.trigger('replace')) return;
    replaceBusy = true;
    try {
      const r = await withMinDuration(
        api.put<{ bytes: number; backedUp: boolean }>(
          '/api/profile/file/cv',
          { content: replaceDraft },
          { silent: true },
        ),
        500,
      );
      body = replaceDraft;
      editDraft = replaceDraft;
      replaceDraft = '';
      toast.success('CV replaced', {
        description:
          (r.bytes / 1024).toFixed(1) +
          ' KB written' +
          (r.backedUp ? ' · previous version safe in cv.md.bak' : '') +
          '. Switch to Reprocess to extract profile fields from the new CV.',
        duration: 8_000,
        action: { label: 'Reprocess now', onClick: () => (activeTab = 'reprocess') },
      });
      activeTab = 'view';
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('CV replace failed', {
        description:
          err.message + ' — your pasted content is still in the textarea, retry to save.',
        action: { label: 'Retry', onClick: () => submitReplace() },
        duration: 12_000,
      });
    } finally {
      replaceBusy = false;
    }
  }

  async function runReprocess() {
    if (reprocessBusy) return;
    reprocessBusy = true;
    reprocessError = null;
    suggestion = null;
    try {
      const r = await withMinDuration(
        api.post<{ suggestion: Suggestion }>('/api/profile/reprocess', {}, { silent: true }),
        800,
      );
      suggestion = r.suggestion;
      toast.success('CV reprocessed', {
        description:
          'Review the proposed fields below and click "Apply suggestions" to merge them into the form. Nothing is saved until you Save Profile.',
        duration: 8_000,
      });
    } catch (e) {
      const err = e as ApiError;
      reprocessError = err.message;
      toast.error('Reprocess failed', {
        description: err.message + ' — Anthropic key required (Settings).',
        action: { label: 'Retry', onClick: () => runReprocess() },
        duration: 12_000,
      });
    } finally {
      reprocessBusy = false;
    }
  }

  function applySuggestionToParent() {
    if (!suggestion || !onApplySuggestion) return;
    onApplySuggestion(suggestion);
    toast.success('Suggestions applied to form', {
      description:
        'Review the highlighted fields on the Profile page, then click Save Profile to persist.',
      duration: 6_000,
    });
    open = false;
  }

  // ---- rendering helpers ----
  let bodyHtml = $derived(renderMarkdown(body));

  let copyState = $state<'idle' | 'copied'>('idle');
  async function copyBody() {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      copyState = 'copied';
      toast.success('CV copied to clipboard');
      setTimeout(() => {
        copyState = 'idle';
      }, 1500);
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  function downloadBody() {
    if (!body) return;
    const blob = new Blob([body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cv.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Suggestion field summary (count + sample) for the Reprocess tab
  let suggestionSummary = $derived.by<{ label: string; sample: string }[]>(() => {
    if (!suggestion) return [];
    const out: { label: string; sample: string }[] = [];
    if (suggestion.candidate?.full_name)
      out.push({ label: 'Full name', sample: suggestion.candidate.full_name });
    if (suggestion.candidate?.email)
      out.push({ label: 'Email', sample: suggestion.candidate.email });
    if (suggestion.candidate?.phone)
      out.push({ label: 'Phone', sample: suggestion.candidate.phone });
    if (suggestion.candidate?.linkedin)
      out.push({ label: 'LinkedIn', sample: suggestion.candidate.linkedin });
    if (suggestion.candidate?.github)
      out.push({ label: 'GitHub', sample: suggestion.candidate.github });
    if (suggestion.candidate?.portfolio_url)
      out.push({ label: 'Portfolio', sample: suggestion.candidate.portfolio_url });
    if (suggestion.narrative?.headline)
      out.push({ label: 'Headline', sample: suggestion.narrative.headline });
    if (suggestion.narrative?.exit_story) {
      const story = suggestion.narrative.exit_story;
      out.push({
        label: 'Exit story',
        sample: story.length > 120 ? story.slice(0, 120) + '…' : story,
      });
    }
    if (suggestion.narrative?.superpowers?.length) {
      out.push({
        label: 'Superpowers',
        sample:
          suggestion.narrative.superpowers.slice(0, 3).join(' · ') +
          (suggestion.narrative.superpowers.length > 3
            ? ` (+${suggestion.narrative.superpowers.length - 3})`
            : ''),
      });
    }
    if (suggestion.narrative?.proof_points?.length) {
      out.push({
        label: 'Proof points',
        sample:
          suggestion.narrative.proof_points
            .slice(0, 2)
            .map((p) => p.name)
            .join(' · ') +
          (suggestion.narrative.proof_points.length > 2
            ? ` (+${suggestion.narrative.proof_points.length - 2})`
            : ''),
      });
    }
    if (suggestion.location?.city || suggestion.location?.country) {
      out.push({
        label: 'Location',
        sample: [
          suggestion.location?.city,
          suggestion.location?.province,
          suggestion.location?.country,
        ]
          .filter(Boolean)
          .join(', '),
      });
    }
    return out;
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
    <Sheet.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div
          class="size-10 rounded-lg bg-foreground/5 ring-1 ring-border flex items-center justify-center flex-shrink-0"
        >
          <FileText class="size-4 text-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <Sheet.Title class="text-base">CV manager</Sheet.Title>
          <Sheet.Description class="text-xs mt-0.5">
            <code class="font-mono text-foreground/80">cv.md</code> is the canonical CV — every PDF, score,
            and cover letter reads from it.
          </Sheet.Description>
        </div>
      </div>
    </Sheet.Header>

    <Tabs.Root
      value={activeTab}
      onValueChange={(v: string) => (activeTab = v as Tab)}
      class="flex-1 flex flex-col min-h-0"
    >
      <Tabs.List class="mx-5 mt-3 h-9 p-0.5 bg-muted/40 self-start">
        <Tabs.Trigger value="view" class="text-xs h-8 px-3 gap-1.5">
          <Eye class="size-3.5" /> View
        </Tabs.Trigger>
        <Tabs.Trigger value="edit" class="text-xs h-8 px-3 gap-1.5">
          <Pencil class="size-3.5" /> Edit
        </Tabs.Trigger>
        <Tabs.Trigger value="replace" class="text-xs h-8 px-3 gap-1.5">
          <ReplaceAll class="size-3.5" /> Replace
        </Tabs.Trigger>
        <Tabs.Trigger value="reprocess" class="text-xs h-8 px-3 gap-1.5">
          <Wand2 class="size-3.5" /> Reprocess
        </Tabs.Trigger>
      </Tabs.List>

      <!-- ============ VIEW ============ -->
      <Tabs.Content value="view" class="flex-1 min-h-0 flex flex-col mt-3">
        {#if bodyLoading}
          <div class="flex-1 flex items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 class="size-4 animate-spin" /> Loading cv.md…
          </div>
        {:else if bodyError}
          <div class="px-5">
            <div
              class="flex items-start gap-2 px-3 py-2.5 rounded-md border border-warning/40 bg-warning/10 text-xs"
            >
              <AlertTriangle class="size-3.5 text-warning mt-0.5 flex-shrink-0" />
              <div class="text-warning/90 flex-1">
                <strong>cv.md not found.</strong> Use the Replace tab to paste a CV — we'll create the
                file for you.
              </div>
            </div>
          </div>
        {:else}
          <div class="flex items-center justify-between gap-2 px-5 pb-2">
            <div class="text-[11px] text-muted-foreground tabular-nums">
              {body.length.toLocaleString()} chars · {(body.length / 1024).toFixed(1)} KB
            </div>
            <div class="flex items-center gap-1">
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="sm"
                        class="h-7 gap-1 text-xs"
                        onclick={copyBody}
                      >
                        {#if copyState === 'copied'}
                          <Check class="size-3 text-success" /> Copied
                        {:else}
                          <Copy class="size-3" /> Copy
                        {/if}
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="bottom" class="text-xs"
                    >Copy raw markdown to clipboard</Tooltip.Content
                  >
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="sm"
                        class="h-7 gap-1 text-xs"
                        onclick={downloadBody}
                      >
                        <Download class="size-3" /> Download
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="bottom" class="text-xs"
                    >Save cv.md to your Downloads folder</Tooltip.Content
                  >
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto px-5 pb-4">
            <article
              class="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-pre:bg-muted prose-strong:text-foreground"
            >
              {@html bodyHtml}
            </article>
          </div>
        {/if}
      </Tabs.Content>

      <!-- ============ EDIT ============ -->
      <Tabs.Content value="edit" class="flex-1 min-h-0 flex flex-col mt-3">
        {#if bodyLoading}
          <div class="flex-1 flex items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 class="size-4 animate-spin" /> Loading cv.md…
          </div>
        {:else}
          <div class="flex items-center justify-between gap-2 px-5 pb-2">
            <div class="text-[11px] text-muted-foreground">
              Edit markdown directly. Changes are saved to <code
                class="font-mono text-foreground/80">cv.md</code
              >
              with a backup to <code class="font-mono text-foreground/80">cv.md.bak</code>.
            </div>
            {#if editDirty}
              <div class="text-[11px] text-warning font-mono tabular-nums">unsaved</div>
            {/if}
          </div>
          <div class="flex-1 overflow-hidden px-5">
            <Textarea
              bind:value={editDraft}
              class="h-full font-mono text-[11px] leading-relaxed resize-none"
              placeholder="Paste your CV markdown here…"
            />
          </div>
          <div class="px-5 py-3 border-t bg-muted/20 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onclick={discardEdit}
              disabled={!editDirty || editBusy}
              class={cn(
                'gap-1.5 transition-all',
                editDiscardArmed &&
                  'bg-destructive/15 text-destructive hover:bg-destructive/25 ring-1 ring-destructive/40 animate-pulse',
              )}
            >
              <RotateCcw class="size-3.5" />
              {editDiscardArmed ? 'Click again to discard' : 'Discard'}
            </Button>
            <Button size="sm" onclick={saveEdit} disabled={!editDirty || editBusy} class="gap-1.5">
              {#if editBusy}
                <Loader2 class="size-3.5 animate-spin" /> Saving…
              {:else}
                <Save class="size-3.5" /> Save CV
              {/if}
            </Button>
          </div>
        {/if}
      </Tabs.Content>

      <!-- ============ REPLACE ============ -->
      <Tabs.Content value="replace" class="flex-1 min-h-0 flex flex-col mt-3">
        <div class="px-5 pb-3 space-y-2">
          <div
            class="flex items-start gap-2 px-3 py-2.5 rounded-md border border-warning/40 bg-warning/10 text-xs"
          >
            <AlertTriangle class="size-3.5 text-warning mt-0.5 flex-shrink-0" />
            <div class="text-warning/90 leading-relaxed">
              <strong>Replace overwrites the entire CV.</strong> The current file is backed up to
              <code class="font-mono">cv.md.bak</code> so you can recover if needed. After
              replacing, run
              <strong>Reprocess</strong> to refresh the profile fields automatically.
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
            Paste your new CV in markdown format. Plain text works too — just won't render with
            headings/lists in the View tab.
          </p>
        </div>
        <div class="flex-1 overflow-hidden px-5">
          <Textarea
            bind:value={replaceDraft}
            class="h-full font-mono text-[11px] leading-relaxed resize-none"
            placeholder="# Your Name&#10;Your headline&#10;&#10;## Experience&#10;…"
          />
        </div>
        <div class="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
          <div class="text-[11px] text-muted-foreground tabular-nums">
            {replaceDraft.length.toLocaleString()} chars
          </div>
          <div class="flex items-center gap-2">
            {#if replaceArmed}
              <Button
                variant="ghost"
                size="sm"
                onclick={() => confirmReplace.disarm()}
                disabled={replaceBusy}
              >
                Cancel
              </Button>
            {/if}
            <Button
              size="sm"
              onclick={submitReplace}
              disabled={!replaceDraft.trim() || replaceBusy}
              class={cn(
                'gap-1.5 transition-all',
                replaceArmed &&
                  'bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/40 animate-pulse',
              )}
            >
              {#if replaceBusy}
                <Loader2 class="size-3.5 animate-spin" /> Replacing…
              {:else if replaceArmed}
                <ReplaceAll class="size-3.5" /> Click again to confirm replace
              {:else}
                <ReplaceAll class="size-3.5" /> Replace cv.md
              {/if}
            </Button>
          </div>
        </div>
      </Tabs.Content>

      <!-- ============ REPROCESS ============ -->
      <Tabs.Content value="reprocess" class="flex-1 min-h-0 flex flex-col mt-3">
        <div class="px-5 pb-3 space-y-3">
          <div class="rounded-md border border-border/40 bg-muted/30 p-3 space-y-2">
            <div class="flex items-baseline gap-2">
              <Sparkles class="size-3.5 text-accent-strong" />
              <span class="text-sm font-medium">What this does</span>
            </div>
            <ul
              class="text-[11px] text-muted-foreground/80 leading-relaxed space-y-0.5 list-disc list-inside ml-1"
            >
              <li>
                Reads <code class="font-mono">cv.md</code> and asks Claude to extract structured fields.
              </li>
              <li>
                Returns a <em>suggestion</em> for: name · email · phone · LinkedIn · GitHub · portfolio
                · headline · exit story · superpowers · proof points · location.
              </li>
              <li>
                Nothing is saved until you click <strong>Apply suggestions</strong>, then
                <strong>Save Profile</strong> on the main page.
              </li>
            </ul>
          </div>
          <div
            class="flex items-start gap-2 px-3 py-2 rounded-md border border-border/40 bg-card text-[11px] text-muted-foreground"
          >
            <Info class="size-3.5 text-info mt-0.5 flex-shrink-0" />
            <p class="leading-relaxed">
              Costs one Anthropic API call (~$0.10–$0.30 on Opus depending on CV size). Requires <code
                class="font-mono">ANTHROPIC_API_KEY</code
              > in Settings.
            </p>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
          {#if reprocessError && !suggestion}
            <div
              class="flex items-start gap-2 px-3 py-2.5 rounded-md border border-destructive/40 bg-destructive/10 text-xs"
            >
              <AlertTriangle class="size-3.5 text-destructive mt-0.5 flex-shrink-0" />
              <div class="text-destructive/90 flex-1">
                <strong>Reprocess failed.</strong>
                <div class="font-mono text-[11px] mt-1 break-all">{reprocessError}</div>
              </div>
            </div>
          {/if}

          {#if suggestion}
            <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Proposed updates ({suggestionSummary.length} field{suggestionSummary.length === 1
                ? ''
                : 's'})
            </div>
            {#if suggestionSummary.length === 0}
              <div class="text-xs text-muted-foreground/80 italic">
                Claude couldn't derive any usable fields from this CV. Make sure cv.md has the
                candidate's contact info, role headline, and experience.
              </div>
            {:else}
              <ul class="space-y-1.5">
                {#each suggestionSummary as s}
                  <li
                    class="flex items-baseline gap-3 text-xs px-3 py-2 rounded-md border border-border/40 bg-card"
                  >
                    <span class="w-24 text-muted-foreground flex-shrink-0">{s.label}</span>
                    <span class="text-foreground flex-1 min-w-0 break-words leading-relaxed"
                      >{s.sample}</span
                    >
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </div>

        <div class="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
          <div class="text-[11px] text-muted-foreground">
            {#if suggestion}
              Click Apply to merge into the form — nothing persists until Save Profile
            {:else}
              Click Run reprocess to query Claude
            {/if}
          </div>
          <div class="flex items-center gap-2">
            {#if suggestion}
              <Button
                variant="ghost"
                size="sm"
                onclick={discardSuggestion}
                disabled={reprocessBusy}
                class={cn(
                  'gap-1.5 transition-all',
                  reprocessDiscardArmed &&
                    'bg-destructive/15 text-destructive hover:bg-destructive/25 ring-1 ring-destructive/40 animate-pulse',
                )}
              >
                <RotateCcw class="size-3.5" />
                {reprocessDiscardArmed ? 'Click again to discard' : 'Discard'}
              </Button>
              <Button
                size="sm"
                onclick={applySuggestionToParent}
                disabled={reprocessBusy || suggestionSummary.length === 0}
                class="gap-1.5"
              >
                <Check class="size-3.5" /> Apply suggestions
              </Button>
            {:else}
              <Button
                size="sm"
                onclick={runReprocess}
                disabled={reprocessBusy || bodyLoading || !!bodyError || !body.trim()}
                class="gap-1.5"
              >
                {#if reprocessBusy}
                  <Loader2 class="size-3.5 animate-spin" /> Running Claude…
                {:else}
                  <Wand2 class="size-3.5" /> Run reprocess
                {/if}
              </Button>
            {/if}
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  </Sheet.Content>
</Sheet.Root>
