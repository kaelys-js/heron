<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  /**
   * Shared error-state placeholder for inline UI failures (failed AI generations,
   * failed loads of a partial pane, etc.). For toast-level errors use `toast.error`
   * via the `api` wrapper. For full-page errors SvelteKit's `+error.svelte` handles it.
   *
   * Sizes mirror EmptyState (sm/md/lg).
   */
  type Size = 'sm' | 'md' | 'lg';
  type Variant = 'inline' | 'card' | 'plain';

  let {
    title = 'Something went wrong',
    description,
    error,
    icon = AlertTriangle,
    size = 'md',
    variant = 'card',
    onretry,
    actions,
    class: className,
  }: {
    title?: string;
    description?: string;
    error?: unknown;
    icon?: any;
    size?: Size;
    variant?: Variant;
    onretry?: () => void;
    actions?: Snippet;
    class?: string;
  } = $props();

  let derivedDesc = $derived.by(() => {
    if (description) return description;
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return undefined;
  });

  let SIZE_PADDING = $derived.by(() => {
    if (size === 'sm') return 'py-4 px-3 gap-1.5';
    if (size === 'lg') return 'py-10 px-6 gap-3';
    return 'py-6 px-5 gap-2';
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
    if (variant === 'card') return 'rounded-lg border border-destructive/30 bg-destructive/5';
    if (variant === 'inline') return '';
    return '';
  });

  let Icon = $derived(icon);
</script>

<div class={cn('flex flex-col items-center text-center', SIZE_PADDING, WRAPPER_CLASS, className)}>
  <div
    class={cn(
      'rounded-xl bg-destructive/10 ring-1 ring-destructive/30 flex items-center justify-center text-destructive flex-shrink-0',
      ICON_BG_SIZE,
    )}
  >
    <Icon class={ICON_SIZE} />
  </div>

  <h3 class={cn('mt-1 text-destructive', TITLE_CLASS)}>{title}</h3>

  {#if derivedDesc}
    <p class={cn('text-destructive/70 leading-relaxed max-w-md', DESC_CLASS)}>{derivedDesc}</p>
  {/if}

  {#if onretry || actions}
    <div
      class={cn(
        'flex items-center gap-2 flex-wrap justify-center',
        size === 'lg' ? 'mt-2' : 'mt-1',
      )}
    >
      {#if onretry}
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5" onclick={onretry}>
          <RefreshCw class="size-3" />
          Try again
        </Button>
      {/if}
      {#if actions}{@render actions()}{/if}
    </div>
  {/if}
</div>
