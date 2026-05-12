<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils';

/**
 * Shared empty-state placeholder. Three sizes:
 *  - sm: a thin one-liner for in-card empty rows (Activity feed, Stats slots)
 *  - md: medium card-ish placeholder for filtered lists (JobList / JobTable / Compact)
 *  - lg: hero placeholder for first-run / inbox-zero moments — supports CTA actions
 *
 * `variant`:
 *  - 'inline': no border, just centered content
 *  - 'card':   dashed-border card around the content (good for empty lists)
 *  - 'plain':  default, sits in flow
 */
type Variant = 'inline' | 'card' | 'plain';
type Size = 'sm' | 'md' | 'lg';

let {
  icon,
  title,
  description,
  size = 'md',
  variant = 'plain',
  actions,
  class: className,
}: {
  icon?: any;
  title?: string;
  description?: string;
  size?: Size;
  variant?: Variant;
  actions?: Snippet;
  class?: string;
} = $props();

let SIZE_PADDING = $derived.by(() => {
  if (size === 'sm') return 'py-6 px-3 gap-1.5';
  if (size === 'lg') return 'py-12 px-6 gap-3';
  return 'py-10 px-5 gap-2';
});
let ICON_SIZE = $derived(size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5');
let ICON_BG_SIZE = $derived(size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10');
let TITLE_CLASS = $derived(
  size === 'sm'
    ? 'text-xs font-medium'
    : size === 'lg'
      ? 'text-base font-semibold'
      : 'text-sm font-semibold',
);
let DESC_CLASS = $derived(
  size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-xs' : 'text-[11px]',
);

let WRAPPER_CLASS = $derived.by(() => {
  if (variant === 'card') return 'rounded-lg border border-dashed border-border/60 bg-card/30';
  if (variant === 'inline') return '';
  return '';
});
</script>

<div class={cn('flex flex-col items-center text-center', SIZE_PADDING, WRAPPER_CLASS, className)}>
  {#if icon}
    {@const Icon = icon}
    <div class={cn('rounded-xl bg-muted/40 ring-1 ring-border/40 flex items-center justify-center text-muted-foreground/80 flex-shrink-0', ICON_BG_SIZE)}>
      <Icon class={cn(ICON_SIZE)} />
    </div>
  {/if}

  {#if title}
    <h3 class={cn('mt-1', TITLE_CLASS)}>{title}</h3>
  {/if}

  {#if description}
    <p class={cn('text-muted-foreground leading-relaxed max-w-md', DESC_CLASS)}>{description}</p>
  {/if}

  {#if actions}
    <div class={cn('flex items-center gap-2 flex-wrap justify-center', size === 'lg' ? 'mt-2' : 'mt-1')}>
      {@render actions()}
    </div>
  {/if}
</div>
