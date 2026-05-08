<script lang="ts">
  /**
   * Module description.
   *
   * @module
   */
  import StatusColumn from '$lib/components/StatusColumn.svelte';
  import { STATUS_ORDER } from '$lib/types';

  let { data } = $props();
</script>

<div class="h-full flex gap-3 p-3 overflow-x-auto">
  {#each STATUS_ORDER as status}
    <StatusColumn title={status} jobs={data.grouped[status] ?? []} />
  {/each}
</div>
