<script lang="ts">
  type Segment = { label: string; value: number; tint?: string };
  let {
    segments = [],
    showLegend = true,
  }: {
    segments: Segment[];
    showLegend?: boolean;
  } = $props();

  let total = $derived(segments.reduce((acc, s) => acc + s.value, 0) || 1);
</script>

<div class="space-y-2">
  <div class="flex h-6 rounded-md overflow-hidden border border-border">
    {#each segments as s}
      {@const pct = (s.value / total) * 100}
      {#if pct > 0}
        <div
          class={(s.tint ?? 'bg-muted') +
            ' flex items-center justify-center text-[10px] font-medium tabular-nums'}
          style={'width: ' + pct + '%'}
          title={s.label + ': ' + s.value + ' (' + pct.toFixed(1) + '%)'}
        >
          {pct >= 8 ? s.value : ''}
        </div>
      {/if}
    {/each}
  </div>
  {#if showLegend}
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {#each segments as s}
        {@const pct = (s.value / total) * 100}
        <div class="flex items-center gap-1.5">
          <span class={'size-2 rounded-sm ' + (s.tint ?? 'bg-muted')}></span>
          <span class="text-muted-foreground">{s.label}</span>
          <span class="font-medium tabular-nums">{s.value}</span>
          <span class="text-muted-foreground/60 tabular-nums">({pct.toFixed(1)}%)</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
