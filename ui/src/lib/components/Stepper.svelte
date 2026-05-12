<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    value = $bindable(0),
    min = -Infinity,
    max = Infinity,
    step = 1,
    decimals = 0,
    suffix = '',
    label = '',
    onchange,
    class: className,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    suffix?: string;
    label?: string;
    onchange?: (v: number) => void;
    class?: string;
  } = $props();

  let invalid = $derived(value < min || value > max || isNaN(value));

  function clamp(v: number): number {
    if (isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }
  function formatted(v: number): string {
    return decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
  }
  function bump(delta: number) {
    const next = clamp(parseFloat((value + delta).toFixed(6)));
    value = next;
    onchange?.(next);
  }
  function onInput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    const parsed = parseFloat(raw);
    if (raw === '' || isNaN(parsed)) {
      value = NaN;
      onchange?.(NaN);
      return;
    }
    value = parsed;
    onchange?.(parsed);
  }
  function onBlur() {
    if (isNaN(value) || value < min || value > max) {
      const fixed = clamp(value);
      value = fixed;
      onchange?.(fixed);
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bump(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bump(-step);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      bump(step * 10);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      bump(-step * 10);
    }
  }
</script>

<div
  class={cn(
    'inline-flex items-stretch h-9 rounded-md border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/40 transition-shadow',
    invalid && 'border-red-500/60 focus-within:ring-red-500/30',
    className,
  )}
>
  <button
    type="button"
    onclick={() => bump(-step)}
    disabled={value <= min}
    aria-label={'Decrease' + (label ? ' ' + label : '')}
    class="px-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors border-r"
  >
    <Minus class="size-3.5" />
  </button>

  <div class="relative flex-1 flex items-center justify-center min-w-[3.5rem] px-1">
    <input
      type="text"
      inputmode="decimal"
      value={isNaN(value) ? '' : formatted(value)}
      oninput={onInput}
      onblur={onBlur}
      onkeydown={onKey}
      class={cn(
        'w-full h-full bg-transparent text-center text-sm font-mono tabular-nums outline-none',
        invalid && 'text-red-300',
      )}
      aria-label={label}
      aria-invalid={invalid}
    />
    {#if suffix}
      <span class="absolute right-1.5 text-[11px] text-muted-foreground/70 pointer-events-none"
        >{suffix}</span
      >
    {/if}
  </div>

  <button
    type="button"
    onclick={() => bump(step)}
    disabled={value >= max}
    aria-label={'Increase' + (label ? ' ' + label : '')}
    class="px-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors border-l"
  >
    <Plus class="size-3.5" />
  </button>
</div>
