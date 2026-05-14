<!--
  ResponsiveActionLabel — group heading inside a ResponsiveActionMenu.
  Use when a menu has multiple sections (e.g. "Switch profile" above
  the profile list, then "Manage" above add-new/manage-all).

  Mobile: small caps label, padded to match item gutters.
  Desktop: bits-ui DropdownMenu.Label (proper aria-labelledby plumbing).
-->
<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  type Props = {
    class?: string;
    children: Snippet;
  };

  let { class: className, children }: Props = $props();
  const isMobile = useIsMobile();
</script>

{#if isMobile.value}
  <div
    class={cn(
      'px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
      className,
    )}
  >
    {@render children()}
  </div>
{:else}
  <DropdownMenu.Label
    class={cn('text-[11px] uppercase tracking-wider text-muted-foreground', className)}
  >
    {@render children()}
  </DropdownMenu.Label>
{/if}
