<!--
  Proof point editor — each entry is a focused mini-card with proper visual
  hierarchy:

    ┌── Header ────────────────────────────────────────────┐
    │  #1   [drag-rank · move up/down]  · [confirm-X remove] │
    │  ┌────────────────────────────────────────────────┐  │
    │  │ Name (large prominent input)                  │  │
    │  └────────────────────────────────────────────────┘  │
    │  ┌─────────────────┐ ┌──────────────────────────┐   │
    │  │ Hero metric (📊)│ │ URL (link icon)          │   │
    │  └─────────────────┘ └──────────────────────────┘   │
    │  ┌────────────────────────────────────────────────┐  │
    │  │ Description (RichTextarea, optional)         │  │
    │  └────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────┘

  Design choices:
    * Name on its own row at the top — it's the primary identifier
    * Hero metric + URL split 50/50 with leading icons
    * Description uses the shared RichTextarea so the user gets auto-grow,
      char/word counts, and ⌘B/⌘I/⌘K markdown shortcuts
    * Per-row remove uses the shared ConfirmGate (red double-click)
    * Move up/down buttons live in the header row, consistent with everywhere
-->
<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import RichTextarea from './RichTextarea.svelte';
  import ValidatedInput from './ValidatedInput.svelte';
  import {
    X,
    Plus,
    ArrowUp,
    ArrowDown,
    TrendingUp,
    Link as LinkIcon,
    Trophy,
    FileText,
    ChevronRight,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { validateUrl } from '$lib/validators';
  import { onDestroy } from 'svelte';

  type ProofPoint = {
    name: string;
    hero_metric?: string;
    url?: string;
    description?: string;
  };

  let {
    items = $bindable<ProofPoint[]>([]),
    onchange,
    class: className,
    /** Prefix used to generate stable DOM ids for the URL fields, so a parent
     *  validation summary can focus a specific row. */
    idPrefix,
  }: {
    items: ProofPoint[];
    onchange?: (next: ProofPoint[]) => void;
    class?: string;
    idPrefix?: string;
  } = $props();

  const confirm = new ConfirmGate();
  onDestroy(() => confirm.destroy());

  // Per-row open/closed state — collapsed rows show only the header summary
  // (index + name preview + remove). New rows default to OPEN so the user
  // can fill them out immediately.
  let openSet = $state<Set<number>>(new Set());
  function toggleOpen(i: number) {
    const next = new Set(openSet);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    openSet = next;
  }

  function commit(next: ProofPoint[]) {
    items = next;
    onchange?.(next);
  }

  function add() {
    const nextIndex = items.length;
    commit([...items, { name: '', hero_metric: '', url: '', description: '' }]);
    // Auto-open the newly-added row
    const next = new Set(openSet);
    next.add(nextIndex);
    openSet = next;
  }

  function update(i: number, patch: Partial<ProofPoint>) {
    commit(items.map((it, j) => (i === j ? { ...it, ...patch } : it)));
  }

  function remove(i: number) {
    if (!confirm.trigger('row:' + i)) return;
    commit(items.filter((_, j) => j !== i));
    // Shift open-state for items after the removed index
    const shifted = new Set<number>();
    for (const k of openSet) {
      if (k < i) shifted.add(k);
      else if (k > i) shifted.add(k - 1);
    }
    openSet = shifted;
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
    // Move the open-state with the row
    const wasIOpen = openSet.has(i);
    const wasJOpen = openSet.has(j);
    const shifted = new Set(openSet);
    shifted.delete(i);
    shifted.delete(j);
    if (wasIOpen) shifted.add(j);
    if (wasJOpen) shifted.add(i);
    openSet = shifted;
  }
</script>

<div class={cn('space-y-3', className)}>
  {#if items.length === 0}
    <div class="rounded-md border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center">
      <Trophy class="size-5 text-muted-foreground/40 mx-auto mb-2" />
      <p class="text-xs text-muted-foreground/80">No proof points yet</p>
      <p class="text-[10px] text-muted-foreground/60 mt-0.5">
        Add concrete projects, articles, or wins below.
      </p>
    </div>
  {/if}

  {#each items as p, i (i)}
    {@const armed = confirm.isArmed('row:' + i)}
    {@const isOpen = openSet.has(i)}
    <div
      class={cn(
        'group/pp rounded-lg border overflow-hidden transition-colors',
        armed
          ? 'border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20'
          : 'border-border/50 bg-card/30 hover:bg-card/50',
      )}
      onfocusin={() => {
        // Auto-expand a collapsed row when a focus lands inside (e.g. via the
        // validation-summary jump-to-error button focusing a URL deep inside).
        if (!openSet.has(i)) {
          const next = new Set(openSet);
          next.add(i);
          openSet = next;
        }
      }}
    >
      <!-- Header row: chevron toggle + index + name preview (when collapsed) + reorder + remove -->
      <div class="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onclick={() => toggleOpen(i)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse proof point ' + (i + 1) : 'Expand proof point ' + (i + 1)}
          class="size-5 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
        >
          <ChevronRight
            class={cn('size-3 transition-transform duration-200 ease-out', isOpen && 'rotate-90')}
          />
        </button>
        <span class="text-[10px] font-mono font-semibold text-muted-foreground/60 tabular-nums w-7"
          >#{(i + 1).toString().padStart(2, '0')}</span
        >
        {#if !isOpen}
          <!-- Collapsed: show name + hero metric inline so the user can scan -->
          <span
            class={cn(
              'text-xs truncate flex-1 min-w-0',
              p.name ? 'font-medium' : 'italic text-muted-foreground/50',
            )}
          >
            {p.name || 'Untitled proof point'}
          </span>
          {#if p.hero_metric}
            <span class="text-[10px] font-mono text-emerald-400/80 truncate max-w-[40%]"
              >· {p.hero_metric}</span
            >
          {/if}
        {:else}
          <span
            class="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium flex-1"
            >Proof point</span
          >
        {/if}
        <Tooltip.Provider delayDuration={250}>
          <div class="flex items-center gap-0.5">
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    disabled={i === 0}
                    onclick={() => move(i, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp class="size-3" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">Move up</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    disabled={i === items.length - 1}
                    onclick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown class="size-3" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">Move down</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    type="button"
                    variant="ghost"
                    size="icon"
                    class={cn(
                      'size-7 transition-colors',
                      armed
                        ? 'text-red-300 bg-red-500/15 hover:bg-red-500/25 ring-1 ring-red-500/40 animate-pulse'
                        : 'text-muted-foreground hover:text-red-300 hover:bg-red-500/10',
                    )}
                    onclick={(e) => {
                      e.preventDefault();
                      remove(i);
                    }}
                    aria-label={armed ? 'Click again to remove proof point' : 'Remove proof point'}
                  >
                    <X class="size-3.5" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">
                {armed ? 'Click again to remove this proof point' : 'Remove proof point'}
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </Tooltip.Provider>
      </div>

      <!--
        Body (collapsible). grid-template-rows: 0fr ↔ 1fr animates the height
        smoothly without measuring DOM.
      -->
      <div
        class={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div class={cn('overflow-hidden min-h-0', !isOpen && 'pointer-events-none')}>
          <div class="px-4 pb-4 pt-1 space-y-3 border-t border-border/30">
            <!-- Name (full-width prominent) -->
            <div class="space-y-1.5 pt-2">
              <Label
                class="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5"
              >
                <Trophy class="size-2.5" /> Name
              </Label>
              <Input
                value={p.name}
                oninput={(e: Event) =>
                  update(i, { name: (e.currentTarget as HTMLInputElement).value })}
                placeholder="Enzuzo: Real-time consent analytics"
                class="h-9 text-sm font-medium"
              />
            </div>

            <!-- Hero metric + URL side by side -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <Label
                  class="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5"
                >
                  <TrendingUp class="size-2.5" /> Hero metric
                </Label>
                <Input
                  value={p.hero_metric ?? ''}
                  oninput={(e: Event) =>
                    update(i, { hero_metric: (e.currentTarget as HTMLInputElement).value })}
                  placeholder="90% faster CI/CD · 3x throughput"
                  class="h-9 text-xs font-mono"
                />
                <p class="text-[10px] text-muted-foreground/60 leading-tight">
                  One concrete number with units, not a vibe ("scaled significantly" → drop it).
                </p>
              </div>
              <div class="space-y-1.5">
                <Label
                  class="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5"
                >
                  <LinkIcon class="size-2.5" /> URL
                  <span class="opacity-50 normal-case font-normal tracking-normal">(optional)</span>
                </Label>
                <ValidatedInput
                  id={idPrefix ? idPrefix + '-' + i : undefined}
                  type="url"
                  value={p.url ?? ''}
                  oninput={(e: Event) =>
                    update(i, { url: (e.currentTarget as HTMLInputElement).value })}
                  placeholder="https://example.com/case-study"
                  validate={validateUrl}
                  class="font-mono"
                  ariaLabel="Proof point URL"
                />
                <p class="text-[10px] text-muted-foreground/60 leading-tight">
                  Case study, blog post, or live demo — anything a reader can verify.
                </p>
              </div>
            </div>

            <!-- Description — RichTextarea -->
            <div class="space-y-1.5">
              <Label
                class="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5"
              >
                <FileText class="size-2.5" /> Description
                <span class="opacity-50 normal-case font-normal tracking-normal"
                  >(optional · supports **bold**, _italic_, [links](url))</span
                >
              </Label>
              <RichTextarea
                value={p.description ?? ''}
                oninput={(v: string) => update(i, { description: v })}
                placeholder="1–3 sentences for cover letters: what was the problem, what did you build, what changed?"
                minRows={3}
                maxRows={10}
                ariaLabel="Proof point description"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  {/each}

  <Button type="button" variant="outline" size="sm" class="h-9 gap-1.5 w-full" onclick={add}>
    <Plus class="size-3.5" /> Add proof point
  </Button>
</div>
