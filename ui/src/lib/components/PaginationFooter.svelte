<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  /**
   * Footer used by Compact / List / Table views to limit how many jobs render initially
   * (so the page stays snappy at 800+ rows). Default page is 25 jobs; users can show
   * more incrementally or expand to all.
   */
  let {
    total,
    visible = $bindable(0),
    pageSize = 25,
    label = 'jobs',
    class: className,
  }: {
    total: number;
    visible: number;
    pageSize?: number;
    label?: string;
    class?: string;
  } = $props();

  let hidden = $derived(Math.max(0, total - visible));
  let allShown = $derived(visible >= total);
  let nextChunk = $derived(Math.min(pageSize, hidden));
</script>

{#if total > pageSize}
  <div
    class={cn(
      'flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground border-t border-border/40',
      className,
    )}
  >
    <span class="tabular-nums">
      {#if allShown}
        Showing all {total.toLocaleString()} {label}
      {:else}
        Showing <span class="text-foreground font-medium">{visible.toLocaleString()}</span> of {total.toLocaleString()}
        {label}
        <span class="text-muted-foreground/60">· {hidden.toLocaleString()} hidden</span>
      {/if}
    </span>
    <div class="flex items-center gap-1">
      {#if !allShown}
        <Button
          variant="ghost"
          size="sm"
          class="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          onclick={() => (visible = Math.min(total, visible + pageSize))}
        >
          <ChevronDown class="size-3" />
          Show {nextChunk.toLocaleString()} more
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 text-[11px] text-muted-foreground hover:text-foreground"
          onclick={() => (visible = total)}
        >
          Show all
        </Button>
      {:else}
        <Button
          variant="ghost"
          size="sm"
          class="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          onclick={() => (visible = pageSize)}
        >
          <ChevronUp class="size-3" />
          Collapse
        </Button>
      {/if}
    </div>
  </div>
{/if}
