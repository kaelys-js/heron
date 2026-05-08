<script lang="ts">
  let { data } = $props();
</script>

<div class="h-full overflow-y-auto p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-semibold mb-6">Pipeline Stats</h1>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Total in pipeline</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.counts.total}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">A-G reports done</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.reports}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">PDFs generated</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.pdfs}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Applied</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.applied}</div>
    </div>
  </div>

  <h2 class="text-lg font-semibold mb-3">By status</h2>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-8">
    {#each Object.entries(data.counts).filter(([k]) => k !== 'total') as [k, v]}
      <div class="bg-panel/40 border border-line rounded p-3">
        <div class="text-xs text-sub capitalize">{k}</div>
        <div class="text-lg font-semibold text-ink">{v}</div>
      </div>
    {/each}
  </div>

  <h2 class="text-lg font-semibold mb-3">Score distribution</h2>
  <div class="grid grid-cols-4 gap-3 mb-8">
    <div class="bg-ok/10 border border-ok/30 rounded p-4">
      <div class="text-xs text-ok uppercase tracking-wide">≥ 4.0 (apply)</div>
      <div class="text-2xl font-semibold text-ok mt-1">{data.dist.high}</div>
    </div>
    <div class="bg-warn/10 border border-warn/30 rounded p-4">
      <div class="text-xs text-warn uppercase tracking-wide">3.0–3.9</div>
      <div class="text-2xl font-semibold text-warn mt-1">{data.dist.mid}</div>
    </div>
    <div class="bg-bad/10 border border-bad/30 rounded p-4">
      <div class="text-xs text-bad uppercase tracking-wide">&lt; 3.0 (skip)</div>
      <div class="text-2xl font-semibold text-bad mt-1">{data.dist.low}</div>
    </div>
    <div class="bg-panel/40 border border-line rounded p-4">
      <div class="text-xs text-sub uppercase tracking-wide">Unscored</div>
      <div class="text-2xl font-semibold text-ink mt-1">{data.dist.unscored}</div>
    </div>
  </div>

  <div class="text-sub text-sm space-y-1 mt-8 border-t border-line pt-6">
    <div>Token spend tracking: not yet implemented (M4+).</div>
    <div>Run <code class="text-accent">npm run scan</code> + <code class="text-accent">scan-broad.py</code> daily for fresh jobs.</div>
    <div>Run <code class="text-accent">gemini-first-pass.py</code> after scans to score (free).</div>
  </div>
</div>
