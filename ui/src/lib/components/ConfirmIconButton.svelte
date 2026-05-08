<!--
  Shared "icon-only destructive button" with built-in double-click-to-confirm.
  Used wherever a tiny icon (X on a chip, Trash on the bell, Star to unpin) is
  the entire UI for a destructive action.

  Behaviour comes from `ConfirmGate` so every destructive icon in the app
  feels identical: first click arms (red tint + tooltip swap + auto-disarm
  after 3s), second click executes.

  Caller controls icon size + extra classes (so a chip's X can stay tiny while
  the bell's clear-feed icon stays size-3.5). The component owns: the click
  handler, the tooltip swap, and the red-tinted armed state.
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  type IconCtor = any;

  let {
    icon,
    onconfirm,
    ariaLabel,
    idleTooltip,
    confirmTooltip = 'Click again to confirm',
    armedIcon,
    /** Tailwind classes for the button. */
    class: className = '',
    /** Tailwind classes for the icon. Defaults sized for typical chip/bell use. */
    iconClass = 'size-3.5',
    /** Forwarded to <Button variant>. 'ghost' for inline, 'outline' for prominent. */
    variant = 'ghost' as 'ghost' | 'outline' | 'default',
    /** Forwarded to <Button size>. */
    size = 'icon' as 'icon' | 'sm',
    disabled = false,
    timeoutMs = 3000,
  }: {
    icon: IconCtor;
    onconfirm: () => void;
    ariaLabel: string;
    idleTooltip: string;
    confirmTooltip?: string;
    armedIcon?: IconCtor;
    class?: string;
    iconClass?: string;
    variant?: 'ghost' | 'outline' | 'default';
    size?: 'icon' | 'sm';
    disabled?: boolean;
    timeoutMs?: number;
  } = $props();

  // svelte-ignore state_referenced_locally — `timeoutMs` is read once at
  // construction; a different value at runtime would require a new gate anyway.
  const confirm = new ConfirmGate(timeoutMs);
  const KEY = 'btn';

  function handleClick(e: MouseEvent) {
    // Stop propagation so this never bubbles into wrapping anchors / cards.
    e.preventDefault();
    e.stopPropagation();
    if (confirm.trigger(KEY)) onconfirm();
  }

  let armed = $derived(confirm.isArmed(KEY));
  let DisplayIcon = $derived(armed && armedIcon ? armedIcon : icon);

  onDestroy(() => confirm.destroy());
</script>

<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props: tipProps })}
        <Button
          {...tipProps}
          type="button"
          {variant}
          {size}
          {disabled}
          class={cn(
            'transition-colors',
            armed
              ? 'text-red-300 bg-red-500/15 hover:bg-red-500/25 ring-1 ring-red-500/40 animate-pulse'
              : '',
            className,
          )}
          onclick={handleClick}
          aria-label={armed ? confirmTooltip : ariaLabel}
        >
          <DisplayIcon class={iconClass} />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="top" class="text-xs">
      {armed ? confirmTooltip : idleTooltip}
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
