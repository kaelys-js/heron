<script lang="ts">
  type Bucket = { label: string; value: number; tint?: string; sub?: { value: number; tint?: string; label?: string } };
  let {
    buckets = [],
    height = 100,
  }: {
    buckets: Bucket[];
    height?: number;
  } = $props();

  let max = $derived(Math.max(1, ...buckets.map((b) => b.value)));
</script>

<div class="flex items-end gap-2" style={'height: ' + height + 'px'}>
  {#each buckets as b}
    {@const totalH = (b.value / max) * height}
    {@const subH = b.sub ? (b.sub.value / max) * height : 0}
    <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
      <div class="w-full h-full flex flex-col-reverse items-stretch">
        <div class="relative w-full rounded-t" style={'height: ' + Math.max(2, totalH) + 'px'}>
          <div class={'absolute inset-x-0 bottom-0 rounded-t ' + (b.tint ?? 'bg-muted')} style={'height: ' + Math.max(2, totalH) + 'px'}></div>
          {#if b.sub}
            <div class={'absolute inset-x-0 bottom-0 rounded-t ' + (b.sub.tint ?? 'bg-primary')} style={'height: ' + Math.max(0, subH) + 'px'}></div>
          {/if}
        </div>
      </div>
      <div class="text-[10px] text-muted-foreground tabular-nums w-full text-center overflow-hidden whitespace-nowrap">{b.label}</div>
      <div class="text-[11px] font-medium tabular-nums">{b.value}</div>
    </div>
  {/each}
</div>
