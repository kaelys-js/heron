<!--
  SourceChip — tiny pill that names where a job was first discovered.

  Reads from the SOURCE_LABELS registry in $lib/types so we get a
  consistent label + tint per scanner without sprinkling string maps
  through the codebase. Unknown sources render as a neutral "Other"
  chip with the raw identifier for debugging.

  Used on the pipeline page job-row + the job detail header.
-->
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { SOURCE_LABELS } from '$lib/types';
  import { cn } from '$lib/utils';

  let {
    source,
    class: className = '',
  }: {
    source: string | undefined;
    class?: string;
  } = $props();

  let meta = $derived.by(() => {
    if (!source) return null;
    const known = SOURCE_LABELS[source];
    if (known) return known;
    // Fallback for sources we haven't catalogued — still render but with a
    // neutral tint and the raw id so we can spot uncategorised values
    // showing up in production.
    return { label: source, tint: 'bg-muted/30 text-muted-foreground border-border/50' };
  });
</script>

{#if meta}
  <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span
            {...props}
            class={cn(
              'inline-flex items-center h-4 px-1.5 rounded-sm border text-[9px] font-mono uppercase tracking-wider cursor-help',
              meta.tint,
              className,
            )}
          >
            {meta.label}
          </span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs max-w-xs">
        <div class="font-medium">{meta.label}</div>
        <div class="text-muted-foreground text-[11px] mt-0.5">
          First discovered via this source. Each URL keeps its
          original attribution even if another scanner re-encounters it later.
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
