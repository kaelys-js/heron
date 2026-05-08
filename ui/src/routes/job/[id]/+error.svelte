<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Briefcase as JobIcon, ArrowLeft, RotateCw } from '@lucide/svelte';
  import { docTitle } from '$lib/config/branding';

  let status = $derived(page.status);
  let err = $derived(page.error);
  let isNotFound = $derived(status === 404);
</script>

<svelte:head>
  <title>{docTitle([isNotFound ? 'Job not found' : 'Job error'])}</title>
</svelte:head>

<div class="h-full flex items-center justify-center p-6 bg-card">
  <Card.Root class="w-full max-w-md">
    <Card.Header>
      <div class="flex items-start gap-4">
        <div class="size-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <JobIcon class="size-5 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <Card.Title class="text-xl tracking-tight">
            {isNotFound ? 'Job not found' : 'Could not load job'}
          </Card.Title>
          <Card.Description class="mt-1.5 leading-relaxed">
            {#if isNotFound}
              The job ID in the URL doesn't match anything in your pipeline. It may have been removed, archived, or the link is stale.
            {:else}
              {err?.message || 'Something went wrong while loading this job.'}
            {/if}
          </Card.Description>
        </div>
      </div>
    </Card.Header>
    <Card.Footer class="gap-2">
      <Button onclick={() => goto('/')} class="gap-1.5">
        Back to pipeline
      </Button>
      <Button variant="ghost" onclick={() => history.back()} class="gap-1.5 text-muted-foreground">
        <ArrowLeft class="size-3.5" />
        Back
      </Button>
    </Card.Footer>
  </Card.Root>
</div>
