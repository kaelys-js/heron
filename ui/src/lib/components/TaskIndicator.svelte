<script lang="ts">
  import { notifications } from '$lib/notifications.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Loader2 } from '@lucide/svelte';

  const TASK_LABEL: Record<string, string> = {
    'scan': 'Scanning jobs',
    'gemini': 'Gemini scoring',
    'apply-linkedin': 'LinkedIn apply',
    'oferta': 'Deep eval',
    'pdf': 'PDF tailoring',
  };

  let labels = $derived(notifications.runningTasks.map((t) => TASK_LABEL[t] ?? t));
  let count = $derived(labels.length);
</script>

{#if count > 0}
  <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <div {...props} class="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Loader2 class="size-3 animate-spin" />
            <span>{labels[0]}{count > 1 ? ' +' + (count - 1) : ''}</span>
          </div>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" class="text-xs">
        <div class="flex flex-col gap-0.5">
          {#each labels as l}
            <div>{l}</div>
          {/each}
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
