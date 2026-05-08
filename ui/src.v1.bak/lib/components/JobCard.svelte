<script lang="ts">
  /**
   * Module description.
   *
   * @module
   */
  import StatusBadge from './StatusBadge.svelte';
  import type { Job } from '$lib/types';

  let { job }: { job: Job } = $props();

  let displayScore = $derived(job.score ?? job.geminiScore);
  let scoreClass = $derived(
    displayScore == null
      ? 'score-na'
      : displayScore >= 4.0 ? 'score-ok'
      : displayScore >= 3.0 ? 'score-warn'
      : 'score-bad'
  );
</script>

<a href={`/job/${job.id}`} class="card block">
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <div class="card-title truncate">{job.role}</div>
      <div class="card-meta truncate">{job.company}{job.location ? ' · ' + job.location : ''}</div>
    </div>
    {#if displayScore != null}
      <span class={`score-badge ${scoreClass}`}>{displayScore.toFixed(1)}</span>
    {/if}
  </div>
  <div class="flex items-center gap-1 mt-2">
    <StatusBadge bgRisk={job.bgRisk} />
    {#if job.reportFile}
      <span class="text-[10px] text-sub">📄 report</span>
    {/if}
    {#if job.pdfFile}
      <span class="text-[10px] text-sub">📎 PDF</span>
    {/if}
  </div>
</a>
