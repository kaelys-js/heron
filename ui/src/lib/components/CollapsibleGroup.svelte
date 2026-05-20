<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';
  import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

  let {
    label,
    icon,
    storageKey,
    defaultOpen = true,
    actions,
    children,
  }: {
    label: string;
    icon?: Snippet;
    storageKey: string;
    defaultOpen?: boolean;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  let fullKey = $derived(`${BRAND_STORAGE_PREFIX}:sidebar-group:` + storageKey);

  function readInitial(key: string): boolean {
    if (typeof window === 'undefined') return defaultOpen;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '0') return false;
      if (raw === '1') return true;
    } catch {}
    return defaultOpen;
  }

  // svelte-ignore state_referenced_locally -- initial seed only; `open` becomes the source of truth.
  let open = $state(readInitial(`${BRAND_STORAGE_PREFIX}:sidebar-group:` + storageKey));

  $effect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(fullKey, open ? '1' : '0');
    } catch {}
  });

  function toggle() {
    open = !open;
  }
</script>

<div class="flex flex-col" data-state={open ? 'open' : 'closed'}>
  <div class="group/clb-header flex items-center gap-1 px-2 py-1.5 mt-2 first:mt-0">
    <button
      type="button"
      onclick={toggle}
      aria-expanded={open}
      class={cn(
        'flex items-center gap-1 flex-1 min-w-0 text-[11px] font-medium tracking-wide uppercase text-muted-foreground dark:text-muted-foreground/70 hover:text-foreground transition-colors rounded -mx-1 px-1 py-0.5',
      )}
    >
      <ChevronRight
        class={cn(
          'size-3 flex-shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-out',
          open && 'rotate-90',
        )}
      />
      {#if icon}{@render icon()}{/if}
      <span class="truncate">{label}</span>
    </button>
    {#if actions}
      <div
        class="flex items-center opacity-0 group-hover/clb-header:opacity-100 focus-within:opacity-100 transition-opacity"
      >
        {@render actions()}
      </div>
    {/if}
  </div>

  <!--
    Smooth height animation via grid-template-rows: 0fr ↔ 1fr.
    Cross-browser, no JS measurement, no layout thrash.
  -->
  <div
    class={cn(
      'grid transition-[grid-template-rows] duration-200 ease-out',
      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    )}
  >
    <div class={cn('overflow-hidden min-h-0', open ? '' : 'pointer-events-none')}>
      {@render children()}
    </div>
  </div>
</div>
