<!--
  CollapsibleCard — like Card.Root but the body collapses with a smooth
  height animation. Header stays visible at all times so the user can find
  any section even when collapsed.

  Persists open/closed state to localStorage under the given storageKey so
  collapsed-by-default sections stay collapsed across reloads.

  The animation uses the grid-template-rows: 0fr ↔ 1fr trick so it interpolates
  height purely in CSS (no JS measurement, no layout thrash).
-->
<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';
  import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

  let {
    title,
    description,
    icon,
    storageKey,
    defaultOpen = true,
    headerActions,
    children,
    class: className = '',
  }: {
    title: string;
    description?: string;
    icon?: Snippet;
    /** localStorage key suffix — namespaced under `career-ops:cc:`. */
    storageKey: string;
    defaultOpen?: boolean;
    headerActions?: Snippet;
    children: Snippet;
    class?: string;
  } = $props();

  const STORAGE_PREFIX = `${BRAND_STORAGE_PREFIX}:cc:`;
  let fullKey = $derived(STORAGE_PREFIX + storageKey);

  function readInitial(): boolean {
    if (typeof window === 'undefined') return defaultOpen;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
      if (raw === '0') return false;
      if (raw === '1') return true;
    } catch {}
    return defaultOpen;
  }

  // svelte-ignore state_referenced_locally — initial seed only.
  let open = $state(readInitial());

  $effect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(fullKey, open ? '1' : '0'); } catch {}
  });

  function toggle() { open = !open; }
</script>

<!--
  Card.Root defaults to `py-4 gap-4` between its flex children — that adds
  ~32px of phantom whitespace below the header when the body is collapsed.
  Override py and gap to 0 here so the only vertical room comes from the
  button + (animated) content. The button's own padding becomes the header's
  natural breathing space.
-->
<Card.Root
  class={cn('overflow-hidden py-0 gap-0', className)}
  data-state={open ? 'open' : 'closed'}
>
  <button
    type="button"
    onclick={toggle}
    aria-expanded={open}
    class="w-full flex items-start gap-3 px-6 py-4 text-left hover:bg-muted/30 transition-colors group/cc"
  >
    <ChevronRight
      class={cn(
        'size-3.5 mt-0.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0',
        open && 'rotate-90',
      )}
    />
    {#if icon}
      <span class="flex-shrink-0 mt-0.5">{@render icon()}</span>
    {/if}
    <div class="flex-1 min-w-0 space-y-0.5">
      <Card.Title class="text-sm leading-tight">{title}</Card.Title>
      {#if description}
        <Card.Description class="text-xs leading-relaxed">{description}</Card.Description>
      {/if}
    </div>
    {#if headerActions}
      <span
        class="flex-shrink-0 self-center"
        role="presentation"
        onclick={(e) => e.stopPropagation()}
      >{@render headerActions()}</span>
    {/if}
  </button>

  <div
    class={cn(
      'grid transition-[grid-template-rows] duration-200 ease-out',
      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    )}
  >
    <div class={cn('overflow-hidden min-h-0', !open && 'pointer-events-none')}>
      <!-- px-6 matches the button padding; pt-1 separates from the header divider; pb-5 keeps the bottom airy without doubling up -->
      <Card.Content class="px-6 pt-1 pb-5">
        {@render children()}
      </Card.Content>
    </div>
  </div>
</Card.Root>
