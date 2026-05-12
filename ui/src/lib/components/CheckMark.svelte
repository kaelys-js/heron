<script lang="ts">
import { Check } from '@lucide/svelte';
import { cn } from '$lib/utils';

/**
 * A checkmark that animates in/out (opacity + scale) when its `active` prop flips.
 * Reserves layout space even when inactive so dropdown rows don't reflow on toggle.
 */
let { active = false, class: className = '' }: { active?: boolean; class?: string } = $props();
</script>

<span
  aria-hidden={!active}
  class={cn(
    'inline-flex items-center justify-center transition-all duration-150 ease-out',
    active ? 'opacity-100 scale-100' : 'opacity-0 scale-50',
    className,
  )}
>
  <Check class="size-3.5 text-emerald-400" />
</span>
