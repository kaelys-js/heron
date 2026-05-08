<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import JobCard from '$lib/components/JobCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { Send } from '@lucide/svelte';
  let { data } = $props();
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="My Applications" subtitle="{data.jobs.length} active" showTabs={false} />
  <div class="p-6">
    <div class="max-w-3xl mx-auto space-y-2">
      {#each data.jobs as job (job.id)}
        <JobCard {job} />
      {/each}
      {#if data.jobs.length === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={Send}
          title="No active applications"
          description="When you apply to a job, mark it as Applied from the job detail page — it'll show up here for follow-up tracking."
        />
      {/if}
    </div>
  </div>
</div>
