<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  type Ev = { ts: number; level: string; source: string; msg: string };
  let events = $state<Ev[]>([]);
  let railOpen = $state(true);
  let connectionStatus = $state<'connecting' | 'open' | 'error'>('connecting');

  onMount(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => (connectionStatus = 'open');
    es.onerror = () => (connectionStatus = 'error');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        events = [ev, ...events].slice(0, 200);
      } catch {}
    };
    return () => es.close();
  });

  function lvl(l: string) {
    return l === 'error' ? 'text-bad'
      : l === 'warn' ? 'text-warn'
      : l === 'success' ? 'text-ok'
      : 'text-sub';
  }
  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString();
  }

  async function trigger(task: string) {
    await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task }) });
  }
</script>

<div class="h-screen flex flex-col bg-bg text-ink overflow-hidden">
  <header class="px-4 py-3 border-b border-line flex items-center gap-4 flex-shrink-0">
    <a href="/" class="text-base font-semibold tracking-tight">
      career-ops
      <span class="text-sub font-normal text-sm">— pipeline</span>
    </a>
    <nav class="ml-auto flex items-center gap-3 text-sm">
      <button onclick={() => trigger('scan')} class="text-sub hover:text-ink">Run Scan</button>
      <button onclick={() => trigger('gemini')} class="text-sub hover:text-ink">Run Gemini</button>
      <button onclick={() => trigger('apply-linkedin')} class="text-sub hover:text-ink">LinkedIn Apply</button>
      <a href="/" class="text-sub hover:text-ink">Board</a>
      <a href="/stats" class="text-sub hover:text-ink">Stats</a>
      <a href="/settings" class="text-sub hover:text-ink">Settings</a>
      <button onclick={() => (railOpen = !railOpen)} class="text-sub hover:text-ink">
        {railOpen ? '⟩' : '⟨'} Activity ({events.length})
      </button>
    </nav>
  </header>
  <div class="flex-1 flex overflow-hidden">
    <main class="flex-1 overflow-hidden">
      {@render children?.()}
    </main>
    {#if railOpen}
      <aside class="w-80 flex-shrink-0 bg-panel/40 border-l border-line flex flex-col overflow-hidden">
        <div class="px-3 py-2 text-xs font-medium text-sub uppercase tracking-wide flex items-center gap-2 border-b border-line">
          <span class="text-ink font-semibold">Activity</span>
          <span class="ml-auto text-{connectionStatus === 'open' ? 'ok' : connectionStatus === 'error' ? 'bad' : 'sub'}">
            ● {connectionStatus}
          </span>
        </div>
        <div class="flex-1 overflow-y-auto text-xs font-mono p-2 space-y-1">
          {#each events as ev (ev.ts + ev.msg)}
            <div class="flex gap-2 leading-tight">
              <span class="text-sub w-16 flex-shrink-0">{fmtTime(ev.ts)}</span>
              <span class="text-accent w-20 flex-shrink-0 truncate">{ev.source}</span>
              <span class={lvl(ev.level) + ' break-words flex-1 min-w-0'}>{ev.msg}</span>
            </div>
          {/each}
          {#if events.length === 0}
            <div class="text-sub italic px-1 py-2">no events yet</div>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>
