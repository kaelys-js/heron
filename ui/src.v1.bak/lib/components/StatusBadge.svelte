/**
 * Module description.
 *
 * @module
 */

<script lang="ts">
  let { bgRisk }: { bgRisk?: string } = $props();
</script>

{#if bgRisk}
  <span class="text-[10px] px-1 py-0.5 rounded font-mono uppercase border bg-{bgRisk?.toLowerCase()}">
    {bgRisk}
  </span>
{/if}
