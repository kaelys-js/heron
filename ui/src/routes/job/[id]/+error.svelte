<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
  import { Briefcase, ArrowLeft } from '@lucide/svelte';
  import { docTitle } from '$lib/config/branding';

  let status = $derived(page.status);
  let err = $derived(page.error);
  let isNotFound = $derived(status === 404);

  // Shares the SAME base (ErrorScreen) as the root +error.svelte, with
  // job-contextual copy so a stale/removed job link reads naturally.
  let title = $derived(isNotFound ? 'Job not found' : 'Could not load job');
  let description = $derived(
    isNotFound
      ? "This job isn't in your pipeline anymore — it may have been removed, archived, or the link is stale."
      : err?.message || 'Something went wrong while loading this job.',
  );
</script>

<svelte:head>
  <title>{docTitle([title])}</title>
</svelte:head>

<ErrorScreen
  {status}
  {title}
  {description}
  accent={isNotFound ? 'text-muted-foreground' : 'text-red-400'}
  errorId={err?.errorId}
>
  {#snippet actions()}
    <Button onclick={() => goto('/')} class="w-full gap-1.5">
      <Briefcase class="size-4" />
      Back to pipeline
    </Button>
    <Button
      variant="ghost"
      onclick={() => history.back()}
      class="w-full gap-1.5 text-muted-foreground"
    >
      <ArrowLeft class="size-4" />
      Go back
    </Button>
  {/snippet}
</ErrorScreen>
