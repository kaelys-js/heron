<script lang="ts">
  /**
   * Module description.
   *
   * @module
   */
  import JobCard from './JobCard.svelte';
  import type { Job } from '$lib/types';

  let { title, jobs = [] }: { title: string; jobs?: Job[] } = $props();
</script>

<div class="col">
  <div class="col-head">
    <span class="text-ink font-semibold">{title}</span>
    <span class="text-sub">{jobs.length}</span>
  </div>
  <div class="col-body">
    {#each jobs as job (job.id)}
      <JobCard {job} />
    {/each}
    {#if jobs.length === 0}
      <div class="text-xs text-sub italic px-1 py-2">empty</div>
    {/if}
  </div>
</div>
