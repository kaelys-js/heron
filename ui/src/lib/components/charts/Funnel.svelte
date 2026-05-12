<script lang="ts">
  type Stage = { label: string; count: number; tint?: string; href?: string };
  let { stages = [] }: { stages: Stage[] } = $props();

  let max = $derived(Math.max(1, ...stages.map((s) => s.count)));
</script>

<div class="space-y-1">
  {#each stages as s, i}
    {@const pct = (s.count / max) * 100}
    {@const prev = i > 0 ? stages[i - 1].count : null}
    {@const drop = prev != null && prev > 0 ? Math.round((1 - s.count / prev) * 100) : null}
    <div class="flex items-center gap-3 group">
      <div class="w-24 text-xs text-muted-foreground tabular-nums text-right shrink-0">
        {s.label}
      </div>
      <div class="flex-1 relative h-7 rounded bg-muted/30 overflow-hidden">
        <div
          class={'absolute inset-y-0 left-0 ' +
            (s.tint ?? 'bg-primary/40') +
            ' transition-all duration-300'}
          style={'width: ' + pct + '%'}
        ></div>
        <div class="absolute inset-0 flex items-center px-2 text-xs font-medium tabular-nums">
          {s.count.toLocaleString()}
        </div>
      </div>
      <div class="w-14 text-[11px] text-right shrink-0">
        {#if drop != null && drop > 0}
          <span class="text-red-400">−{drop}%</span>
        {:else if drop != null && drop < 0}
          <span class="text-emerald-400">+{Math.abs(drop)}%</span>
        {:else if drop != null}
          <span class="text-muted-foreground">0%</span>
        {/if}
      </div>
    </div>
  {/each}
</div>
