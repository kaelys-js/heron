<!--
  RichTextarea — auto-growing markdown-aware textarea.

  Drop-in replacement for ui/textarea wherever multi-line prose lives. Adds:
    * Auto-grow that snaps to the content height (capped at maxRows)
    * Word + character counters in the bottom-right corner
    * Cmd/Ctrl+B and Cmd/Ctrl+I to wrap the selection in **bold** / _italic_
    * Cmd/Ctrl+K turns the selection into a [text](url) link prompt
    * Markdown hint footer that fades in on focus
    * Subtle ring on focus so it feels like a "real" editor, not just a box

  Usage:
    <RichTextarea bind:value={x} placeholder="…" minRows={4} maxRows={12} />
-->
<script lang="ts">
import { cn } from '$lib/utils';
import { Bold, Italic, Link as LinkIcon, Sparkles } from '@lucide/svelte';

let {
  value = $bindable(''),
  placeholder = '',
  minRows = 4,
  maxRows = 16,
  class: className = '',
  showCounter = true,
  showHints = true,
  disabled = false,
  /** Optional accessible label. */
  ariaLabel,
  /** Fires whenever value changes (typing, paste, formatter shortcuts).
   *  Use this when the parent stores text via immutable patches instead of
   *  `bind:value`. */
  oninput,
}: {
  value?: string;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  class?: string;
  showCounter?: boolean;
  showHints?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  oninput?: (next: string) => void;
} = $props();

let el = $state<HTMLTextAreaElement | null>(null);
let focused = $state(false);

// Estimated line height in px — comes out to ~21px at text-sm with leading-relaxed.
// We compute exact maxHeight from this, which is good enough for the "grow until
// N rows then scroll" behaviour without measuring CSS.
const LINE_PX = 21;
let maxHeightPx = $derived(maxRows * LINE_PX + 24); // +24 for vertical padding
let minHeightPx = $derived(minRows * LINE_PX + 24);

/**
 * Resize the textarea to fit its content. Clamped between min/max so the
 * caller always gets predictable heights.
 */
function resize() {
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(Math.max(el.scrollHeight, minHeightPx), maxHeightPx);
  el.style.height = next + 'px';
  // Once we hit the cap, allow scrolling inside the textarea.
  el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
}

// Re-grow whenever value changes (programmatic OR user input).
$effect(() => {
  void value;
  queueMicrotask(resize);
});

// Single mutation point so both bind:value and the oninput callback stay
// in sync regardless of which side the parent uses.
function setValue(next: string) {
  value = next;
  oninput?.(next);
}

// Insert markup around the current selection. After mutation, restore the
// selection so the user can keep typing without reaching for the mouse.
function wrapSelection(before: string, after: string) {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = value.slice(start, end);
  setValue(value.slice(0, start) + before + selected + after + value.slice(end));
  queueMicrotask(() => {
    if (!el) return;
    el.focus();
    el.selectionStart = start + before.length;
    el.selectionEnd = end + before.length;
  });
}

function insertLink() {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = value.slice(start, end) || 'link text';
  const url = window.prompt('URL:', 'https://');
  if (!url) return;
  const md = '[' + selected + '](' + url + ')';
  setValue(value.slice(0, start) + md + value.slice(end));
  queueMicrotask(() => {
    if (!el) return;
    el.focus();
    const pos = start + md.length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
  });
}

function onKey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey;
  if (!meta) return;
  if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    wrapSelection('**', '**');
  } else if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    wrapSelection('_', '_');
  } else if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    insertLink();
  }
}

let charCount = $derived(value.length);
let wordCount = $derived(value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0);
</script>

<div class={cn('relative group/rt rounded-md border border-input bg-transparent transition-colors', focused && 'ring-2 ring-ring/40 border-ring/40', className)}>
  <!-- Tiny formatting toolbar fades in on focus / hover -->
  {#if showHints && !disabled}
    <div
      class={cn(
        'absolute top-1.5 right-2 flex items-center gap-0.5 transition-opacity duration-150 z-10',
        focused ? 'opacity-100' : 'opacity-0 group-hover/rt:opacity-60',
      )}
    >
      <button
        type="button"
        onmousedown={(e) => { e.preventDefault(); wrapSelection('**', '**'); }}
        class="size-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Bold (⌘B)"
        aria-label="Bold"
      >
        <Bold class="size-3" />
      </button>
      <button
        type="button"
        onmousedown={(e) => { e.preventDefault(); wrapSelection('_', '_'); }}
        class="size-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Italic (⌘I)"
        aria-label="Italic"
      >
        <Italic class="size-3" />
      </button>
      <button
        type="button"
        onmousedown={(e) => { e.preventDefault(); insertLink(); }}
        class="size-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Link (⌘K)"
        aria-label="Link"
      >
        <LinkIcon class="size-3" />
      </button>
    </div>
  {/if}

  <textarea
    bind:this={el}
    {value}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    oninput={(e) => { setValue((e.currentTarget as HTMLTextAreaElement).value); resize(); }}
    onkeydown={onKey}
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    rows={minRows}
    style="min-height: {minHeightPx}px; max-height: {maxHeightPx}px; overflow-y: hidden;"
    class={cn(
      'w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed font-sans',
      'placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      // Reserve space for the toolbar/counter on the right
      showHints && 'pr-24',
    )}
  ></textarea>

  {#if showCounter}
    <div
      class={cn(
        'absolute bottom-1.5 right-2 flex items-center gap-2 text-[10px] font-mono tabular-nums pointer-events-none transition-opacity',
        focused ? 'text-muted-foreground' : 'text-muted-foreground/40',
      )}
    >
      {#if showHints && focused}
        <Sparkles class="size-2.5 text-amber-400/70" />
        <span class="hidden md:inline">⌘B · ⌘I · ⌘K</span>
      {/if}
      <span>{wordCount}w · {charCount}c</span>
    </div>
  {/if}
</div>
