<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    title = 'Something went wrong',
    children,
    failed,
    onretry,
  }: {
    title?: string;
    children?: Snippet;
    failed?: Snippet<[unknown, () => void]>;
    onretry?: () => void;
  } = $props();
</script>

<svelte:boundary>
  {@render children?.()}
  {#snippet failed(error, reset)}
    <div class="flex flex-col items-center justify-center p-6 rounded-lg border border-red-500/30 bg-red-500/5 text-center gap-2">
      <AlertTriangle class="size-6 text-red-400" />
      <div class="text-sm font-medium text-red-300">{title}</div>
      <div class="text-xs text-muted-foreground max-w-md">{(error instanceof Error ? error.message : String(error))}</div>
      <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5 mt-2" onclick={() => { onretry?.(); reset(); }}>
        <RefreshCw class="size-3" /> Try again
      </Button>
    </div>
  {/snippet}
</svelte:boundary>
