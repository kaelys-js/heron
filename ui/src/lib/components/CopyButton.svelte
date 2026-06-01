<!--
  CopyButton — copies `text` to the clipboard with a satisfying Copy→Check icon
  morph and an sr-only live-region announcement ("<label> copied"). The button's
  accessible name stays stable ("Copy <label>") so the morph doesn't re-announce
  the name; only the polite live region speaks the result. Reduced-motion users
  get an instant swap (the global animation/transition clamp in app.css). Reuses
  the app's copyToClipboard (native Capacitor clipboard + web fallback).
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Copy, Check } from '@lucide/svelte';
  import { copyToClipboard } from '$lib/client/capacitor-plugins';

  let {
    text,
    label = 'reference',
    class: klass = '',
  }: { text: string; label?: string; class?: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1600);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<button
  type="button"
  onclick={copy}
  aria-label="Copy {label}"
  class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 {klass}"
>
  <span class="relative inline-flex size-3.5 items-center justify-center" aria-hidden="true">
    <Copy
      class="absolute size-3.5 transition-all duration-200 {copied
        ? 'scale-0 opacity-0'
        : 'scale-100 opacity-100'}"
    />
    <Check
      class="absolute size-3.5 text-success transition-all duration-200 {copied
        ? 'scale-100 opacity-100'
        : 'scale-0 opacity-0'}"
    />
  </span>
  <span>{copied ? 'Copied' : 'Click to copy'}</span>
  <span class="sr-only" aria-live="polite">{copied ? `${label} copied` : ''}</span>
</button>
