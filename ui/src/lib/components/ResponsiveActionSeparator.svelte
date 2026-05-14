<!--
  ResponsiveActionSeparator — visual divider between groups of
  ResponsiveActionItems. Renders as bits-ui DropdownMenu.Separator on
  desktop (proper menu-role + keyboard navigation) and a plain thin
  rule on mobile.

  Use cases:
    • Destructive items separated from neutral ones ("Sign out" below
      a divider, away from "Settings" / "Profile")
    • Logical groupings (recents above sources, sources above admin)
-->
<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';

  const isMobile = useIsMobile();
</script>

{#if isMobile.value}
  <div role="separator" aria-orientation="horizontal" class="my-1 h-px bg-border/40 mx-2"></div>
{:else}
  <DropdownMenu.Separator />
{/if}
