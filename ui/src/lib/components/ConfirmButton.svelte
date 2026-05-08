<!--
  Shared "labeled destructive button" with built-in double-click-to-confirm.
  Use whenever a destructive action needs a text label (Delete, Replace,
  Clear feed). For tiny icon-only contexts use ConfirmIconButton instead.

  First click: text swaps to "Click again to confirm <verb>", button turns
  red, 3s timer starts. Second click: fires onconfirm + disarms.

  Animations: the red state pulses subtly so it's visually obvious without
  being distracting.
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  type IconCtor = any;

  let {
    onconfirm,
    /** Default label shown when not armed. */
    idleLabel,
    /** Override for the armed label. Defaults to "Click again to confirm". */
    confirmLabel,
    /** Optional verb tacked onto the default armed label, e.g. "delete" → "Click again to delete". */
    confirmVerb,
    idleIcon,
    confirmIcon,
    class: className = '',
    iconClass = 'size-3.5',
    variant = 'outline' as 'ghost' | 'outline' | 'default',
    size = 'sm' as 'icon' | 'sm' | 'default' | 'lg',
    disabled = false,
    busy = false,
    busyLabel = 'Working…',
    timeoutMs = 3000,
  }: {
    onconfirm: () => void;
    idleLabel: string;
    confirmLabel?: string;
    confirmVerb?: string;
    idleIcon?: IconCtor;
    confirmIcon?: IconCtor;
    class?: string;
    iconClass?: string;
    variant?: 'ghost' | 'outline' | 'default';
    size?: 'icon' | 'sm' | 'default' | 'lg';
    disabled?: boolean;
    busy?: boolean;
    busyLabel?: string;
    timeoutMs?: number;
  } = $props();

  // svelte-ignore state_referenced_locally — `timeoutMs` is read once at
  // construction; a different value at runtime would require a new gate anyway.
  const confirm = new ConfirmGate(timeoutMs);
  const KEY = 'btn';

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || disabled) return;
    if (confirm.trigger(KEY)) onconfirm();
  }

  let armed = $derived(confirm.isArmed(KEY));
  let label = $derived(
    busy ? busyLabel
    : armed ? (confirmLabel ?? ('Click again to ' + (confirmVerb ?? 'confirm')))
    : idleLabel,
  );
  let DisplayIcon = $derived(armed && confirmIcon ? confirmIcon : idleIcon);

  onDestroy(() => confirm.destroy());
</script>

<Button
  type="button"
  {variant}
  {size}
  {disabled}
  onclick={handleClick}
  class={cn(
    'gap-1.5 transition-all',
    armed
      ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 border-red-500/50 animate-pulse'
      : '',
    className,
  )}
>
  {#if DisplayIcon}
    <DisplayIcon class={iconClass} />
  {/if}
  <span>{label}</span>
</Button>
