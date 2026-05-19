<!--
  ResponsiveActionMenu — drawer on mobile, dropdown on desktop.

  iOS HIG: tap-target popups on phone-shaped devices should slide up
  from the bottom (action sheet / drawer) instead of floating as a
  shrunken desktop dropdown. Desktop expects the inverse — bottom
  sheets feel heavy and intrusive when you have a mouse and 1440px+
  of horizontal real estate.

  This component is a thin wrapper that:
    • Detects viewport via the shared `useIsMobile()` matchMedia hook
    • Renders bits-ui `Sheet` with `side="bottom"` when mobile
    • Renders bits-ui `DropdownMenu` when desktop
    • Exposes the same set of slots / props / events for both paths
      so consumers don't have to repeat their menu items twice

  API (Svelte 5 snippets):

    <ResponsiveActionMenu bind:open title="Theme" description="Pick the look you prefer.">
      {#snippet trigger({ props })}
        <Button {...props}>Open</Button>
      {/snippet}
      {#snippet items()}
        <ResponsiveActionItem onSelect={...} icon={Sun} active={mode === 'light'}>
          Light
          <span slot="description">Always light</span>
        </ResponsiveActionItem>
        ...
      {/snippet}
    </ResponsiveActionMenu>

  The `ResponsiveActionItem` companion (defined below in same file —
  Svelte allows multiple components per file only via separate files;
  exported as its own file: see ResponsiveActionItem.svelte) renders
  identically as a dropdown menu item AND a bottom-sheet list row, so
  the consumer writes ONE markup that works in both contexts.
-->
<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /** Two-way bound open state. */
    open?: boolean;
    /** Title shown at the top of the mobile sheet AND used as the
     *  accessible label on the dropdown trigger. Optional on desktop
     *  (dropdowns rarely need a title row); required on mobile so the
     *  sheet has a clear visual handle for what it's offering. */
    title?: string;
    /** Sub-line shown below the title on mobile. */
    description?: string;
    /** Where the desktop dropdown anchors relative to its trigger.
     *  Mobile ignores this -- sheets are always bottom-anchored. */
    align?: 'start' | 'end' | 'center';
    /** Override the desktop dropdown width. Mobile is always full-width. */
    desktopWidth?: string;
    /** Trigger snippet -- receives `props` that must be spread onto
     *  the actual trigger element (Button / div / etc.). */
    trigger: Snippet<[{ props: Record<string, unknown> }]>;
    /** Items snippet -- same markup works for both desktop dropdown
     *  AND mobile sheet. Use ResponsiveActionItem inside. */
    items: Snippet;
    /** Optional tooltip content shown on hover of the trigger on
     *  desktop. Hidden on mobile (no hover; long-press tooltips are
     *  the wrong UX). Useful when the trigger is icon-only and needs
     *  a hint, or when the menu's state-of-the-world differs from
     *  the button label (e.g. "Already applied -- open to apply again"). */
    tooltip?: Snippet;
    /** Tooltip side anchor. Defaults to "top" which is the usual
     *  Apple-style placement above the trigger button. */
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
    /** Tooltip delay in ms. Defaults to 300 -- short enough for
     *  power users, long enough not to flash on quick mouseover. */
    tooltipDelay?: number;
    class?: string;
  };

  let {
    open = $bindable(false),
    title,
    description,
    align = 'end',
    desktopWidth = 'w-56',
    trigger,
    items,
    tooltip,
    tooltipSide = 'top',
    tooltipDelay = 300,
    class: className,
  }: Props = $props();

  const isMobile = useIsMobile();
</script>

{#if isMobile.value}
  <!--
    Mobile path — bottom sheet.
    The bits-ui Sheet handles overlay-tap dismiss, escape-to-close,
    aria-modal, focus-trap, and animation timing for us. We just style
    the content + drag-handle.
  -->
  <Sheet.Root bind:open>
    <Sheet.Trigger>
      {#snippet child({ props })}
        {@render trigger({ props })}
      {/snippet}
    </Sheet.Trigger>
    <Sheet.Content
      side="bottom"
      class={cn(
        'flex flex-col gap-0 p-0 rounded-t-2xl max-h-[85svh]',
        // pb-safe so the last item clears the iOS home indicator.
        'pb-[max(1rem,env(safe-area-inset-bottom))]',
        className,
      )}
      showCloseButton={false}
    >
      <!-- Drag-handle pill — pure visual cue. Sheet dismisses via
           overlay-tap + Escape; the handle is for affordance only. -->
      <div
        aria-hidden="true"
        class="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30 flex-shrink-0"
      ></div>

      {#if title}
        <div class="px-5 pt-2 pb-3 flex flex-col gap-0.5 border-b border-border/40">
          <Sheet.Title class="text-base font-semibold">{title}</Sheet.Title>
          {#if description}
            <Sheet.Description class="text-xs text-muted-foreground"
              >{description}</Sheet.Description
            >
          {/if}
        </div>
      {/if}

      <!-- Scrollable items area. min-h so a one-item sheet still has
           a comfortable tap-area; max-h is enforced by the parent. -->
      <div class="flex flex-col gap-1 px-2 py-2 overflow-y-auto min-h-[120px]">
        {@render items()}
      </div>
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <!--
    Desktop path — popover/dropdown.
    The bits-ui DropdownMenu handles positioning, keyboard nav, and
    click-outside dismiss. We just inject the trigger + items.

    When a `tooltip` snippet is provided, the trigger is double-wrapped
    in Tooltip.Trigger so that hovering shows a hint AND clicking opens
    the menu. The trigger button must spread BOTH `tipProps` and
    `ddProps` (which are merged here before being handed to the trigger
    snippet via `props`).
  -->
  <DropdownMenu.Root bind:open>
    {#if tooltip}
      <Tooltip.Provider delayDuration={tooltipDelay}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props: tipProps })}
              <DropdownMenu.Trigger>
                {#snippet child({ props: ddProps })}
                  {@render trigger({ props: { ...tipProps, ...ddProps } })}
                {/snippet}
              </DropdownMenu.Trigger>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side={tooltipSide} class="text-xs max-w-xs">
            {@render tooltip()}
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {:else}
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          {@render trigger({ props })}
        {/snippet}
      </DropdownMenu.Trigger>
    {/if}
    <DropdownMenu.Content {align} class={cn(desktopWidth, className)}>
      {#if title}
        <DropdownMenu.Label class="flex flex-col gap-0.5 pb-2">
          <span class="text-sm font-medium">{title}</span>
          {#if description}
            <span class="text-xs text-muted-foreground font-normal">{description}</span>
          {/if}
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
      {/if}
      {@render items()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
