<!--
  ResponsiveActionItem — single row inside a ResponsiveActionMenu.

  Renders as a DropdownMenu.Item on desktop and a tall touch-target
  row on mobile (44pt minimum per iOS HIG). One markup, two contexts.

  Props:
    onSelect: handler — fires on click / tap / Enter / Space.
    icon:     Lucide icon component (optional).
    active:   when true, renders a check mark on the trailing edge.
    danger:   when true, tints the row red (destructive action).

  The companion useIsMobile hook is consulted internally so the row
  reads the current viewport and styles itself accordingly. We do NOT
  read it via Svelte context because the parent menu component might
  not even be in scope (e.g. if a consumer renders ResponsiveActionItem
  outside a ResponsiveActionMenu, the row still works as a plain row).
-->
<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import CheckMark from './CheckMark.svelte';
  import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
  import { cn } from '$lib/utils';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';

  type Props = {
    onSelect: () => void;
    /** Lucide-style icon component. Renders in a tinted square tile on
     *  mobile, inline on desktop. Mutually-exclusive with `leading`. */
    icon?: any;
    /** Custom leading snippet -- use for things that aren't a single
     *  icon (profile-color dots, avatars, multi-element badges). Takes
     *  precedence over `icon` if both are provided. */
    leading?: Snippet;
    /** Optional trailing snippet for things like meta counts, status
     *  badges, kbd shortcut hints. Rendered after the label, before
     *  the active-checkmark. */
    trailing?: Snippet;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    class?: string;
    children: Snippet;
    /** Optional secondary line shown beneath the primary label.
     *  Useful on mobile rows where there's room; rendered as
     *  muted-text on the desktop dropdown too. */
    description?: string;
    /** When false, picking this item does NOT dismiss the parent
     *  menu/sheet. Useful for toggle-style menus where the user
     *  wants to preview multiple options without re-opening
     *  (e.g. Tab/Sort/View dropdowns on the pipeline page). */
    closeOnSelect?: boolean;
  };

  let {
    onSelect,
    icon: Icon,
    leading,
    trailing,
    active = false,
    danger = false,
    disabled = false,
    class: className,
    children,
    description,
    closeOnSelect = true,
  }: Props = $props();

  const isMobile = useIsMobile();
</script>

{#if isMobile.value}
  <!--
    Mobile row — full-width, 44pt min height, generous padding for
    fat-finger tap targets. Active-scale feedback per iOS HIG.
  -->
  <button
    type="button"
    onclick={onSelect}
    {disabled}
    class={cn(
      'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
      'min-h-[44px]', // iOS HIG minimum tap target
      'hover:bg-muted/60 active:bg-muted/80 active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
      danger && 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15',
      className,
    )}
  >
    {#if leading}
      {@render leading()}
    {:else if Icon}
      <span
        class={cn(
          'flex size-9 items-center justify-center rounded-lg flex-shrink-0',
          danger ? 'bg-red-500/10 text-red-400' : 'bg-muted text-foreground',
        )}
      >
        <Icon class="size-4" />
      </span>
    {/if}
    <span class="flex-1 min-w-0">
      <span class="block text-sm font-medium leading-tight truncate">
        {@render children()}
      </span>
      {#if description}
        <span class="block mt-0.5 text-xs text-muted-foreground leading-tight">
          {description}
        </span>
      {/if}
    </span>
    {#if trailing}
      {@render trailing()}
    {/if}
    {#if active}
      <span
        class="flex-shrink-0"
        transition:scale={{ duration: 160, start: 0.6, easing: cubicOut }}
      >
        <CheckMark active class="size-4" />
      </span>
    {/if}
  </button>
{:else}
  <!--
    Desktop row — bits-ui DropdownMenu.Item, smaller padding because
    the surface is a popover not a touch sheet. Same icon + active
    check + danger tint conventions so the visual language matches.
  -->
  <DropdownMenu.Item
    {disabled}
    {closeOnSelect}
    class={cn(
      'gap-2.5 cursor-pointer',
      danger && 'text-red-400 focus:bg-red-500/10 focus:text-red-300',
      className,
    )}
    {onSelect}
  >
    {#if leading}
      {@render leading()}
    {:else if Icon}
      <Icon class="size-4 flex-shrink-0" />
    {/if}
    <span class="flex-1 min-w-0">
      <span class="block">{@render children()}</span>
      {#if description}
        <span class="block text-xs text-muted-foreground leading-tight">{description}</span>
      {/if}
    </span>
    {#if trailing}
      {@render trailing()}
    {/if}
    {#if active}
      <span
        class="ml-auto flex-shrink-0"
        transition:scale={{ duration: 160, start: 0.6, easing: cubicOut }}
      >
        <CheckMark active class="size-3.5" />
      </span>
    {/if}
  </DropdownMenu.Item>
{/if}
