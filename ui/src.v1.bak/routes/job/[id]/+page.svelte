<script lang="ts">
  import { marked } from 'marked';
  let { data } = $props();
  let html = $derived(data.report ? marked.parse(data.report) : '');

  let prepLoading = $state(false);
  let prepContent = $state('');
  let prepHtml = $derived(prepContent ? marked.parse(prepContent) : '');

  let chatHistory = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
  let chatInput = $state('');
  let chatLoading = $state(false);
  let chatPersona = $state('Hiring Manager');

  let offerInput = $state('');
  let negotiationContent = $state('');
  let negotiationHtml = $derived(negotiationContent ? marked.parse(negotiationContent) : '');
  let negotiationLoading = $state(false);

  let activePanel = $state<'report' | 'prep' | 'mock' | 'negotiation'>('report');

  async function loadPrep() {
    if (!data.job?.reportFile) return;
    prepLoading = true;
    try {
      const r = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile }),
      });
      const j = await r.json();
      prepContent = j.ok ? j.content : 'Error: ' + (j.error || 'unknown');
    } finally {
      prepLoading = false;
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !data.job?.reportFile) return;
    const msg = chatInput.trim();
    chatInput = '';
    const newHistory = [...chatHistory, { role: 'user' as const, content: msg }];
    chatHistory = newHistory;
    chatLoading = true;
    try {
      const r = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, history: newHistory, persona: chatPersona }),
      });
      const j = await r.json();
      if (j.ok) chatHistory = [...newHistory, { role: 'assistant', content: j.reply }];
      else chatHistory = [...newHistory, { role: 'assistant', content: '⚠️ ' + (j.error || 'error') }];
    } finally {
      chatLoading = false;
    }
  }

  async function startMock() {
    if (!data.job?.reportFile) return;
    chatHistory = [];
    chatLoading = true;
    try {
      const r = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, history: [], persona: chatPersona }),
      });
      const j = await r.json();
      chatHistory = [{ role: 'assistant', content: j.ok ? j.reply : '⚠️ ' + (j.error || 'error') }];
    } finally {
      chatLoading = false;
    }
  }

  async function getNegotiation() {
    if (!data.job?.reportFile || !offerInput.trim()) return;
    negotiationLoading = true;
    try {
      const r = await fetch('/api/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, offer: offerInput }),
      });
      const j = await r.json();
      negotiationContent = j.ok ? j.content : '⚠️ ' + (j.error || 'error');
    } finally {
      negotiationLoading = false;
    }
  }

  async function updateStatus(newStatus: string) {
    if (!data.job?.url) return;
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.job.url, newStatus }),
    });
    location.reload();
  }
</script>

<div class="h-full overflow-y-auto p-6">
  <a href="/" class="text-sub text-sm hover:text-ink">← back to board</a>
  {#if data.job}
    <h1 class="text-2xl font-semibold mt-2">{data.job.company} — {data.job.role}</h1>
    <div class="text-sub text-sm mt-1">
      {data.job.location || '—'} ·
      <a class="hover:text-accent" href={data.job.url} target="_blank" rel="noopener">open posting ↗</a>
    </div>
    <div class="flex gap-3 mt-4 text-sm flex-wrap items-center">
      {#if data.job.score != null}
        <span class="score-badge {data.job.score >= 4 ? 'score-ok' : data.job.score >= 3 ? 'score-warn' : 'score-bad'}">
          score {data.job.score.toFixed(1)}
        </span>
      {/if}
      {#if data.job.bgRisk}
        <span class="text-xs px-2 py-1 rounded border bg-{data.job.bgRisk.toLowerCase()}">BG {data.job.bgRisk}</span>
      {/if}
      <span class="text-xs px-2 py-1 rounded border border-line text-sub">status: {data.job.status}</span>
      <select onchange={(e) => updateStatus((e.target as HTMLSelectElement).value)} class="text-xs bg-panel border border-line rounded px-2 py-1">
        <option value="">→ change status</option>
        {#each ['New', 'Scoring', 'Scored', 'READY-TO-APPLY', 'APPLIED', 'SCREENED', 'INTERVIEW', 'OFFER', 'REJECTED', 'CLOSED'] as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>

    <div class="flex gap-1 mt-6 border-b border-line">
      {#each [['report', '📄 Report'], ['prep', '📚 Interview Prep'], ['mock', '💬 Mock Interview'], ['negotiation', '💰 Negotiation']] as [key, label]}
        <button
          onclick={() => (activePanel = key as any)}
          class="px-3 py-2 text-sm border-b-2 -mb-px transition-colors {activePanel === key ? 'border-accent text-ink' : 'border-transparent text-sub hover:text-ink'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <div class="mt-4">
      {#if activePanel === 'report'}
        {#if data.report}
          <article class="prose prose-invert max-w-none prose-headings:text-ink prose-a:text-accent prose-strong:text-ink prose-th:text-ink prose-td:text-sub">
            {@html html}
          </article>
        {:else}
          <div class="text-sub italic">No deep evaluation report yet for this job.</div>
        {/if}
      {/if}

      {#if activePanel === 'prep'}
        {#if !prepContent}
          <button onclick={loadPrep} disabled={prepLoading} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {prepLoading ? 'Generating...' : 'Generate Interview Prep Brief'}
          </button>
          <div class="text-sub text-xs mt-2">Uses Claude to produce 8-12 likely questions, STAR map, study plan, talking points, red flags, and questions to ask back.</div>
        {:else}
          <article class="prose prose-invert max-w-none">
            {@html prepHtml}
          </article>
        {/if}
      {/if}

      {#if activePanel === 'mock'}
        <div class="flex items-center gap-2 mb-3">
          <label class="text-sm text-sub">Persona:</label>
          <select bind:value={chatPersona} class="text-sm bg-panel border border-line rounded px-2 py-1">
            <option>Recruiter Screen</option>
            <option>Hiring Manager</option>
            <option>Tech Lead / Peer</option>
            <option>Cross-functional</option>
          </select>
          <button onclick={startMock} disabled={chatLoading} class="px-3 py-1 text-sm bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {chatHistory.length === 0 ? 'Start Mock' : 'Restart'}
          </button>
        </div>

        <div class="border border-line rounded bg-panel/40 p-3 max-h-[60vh] overflow-y-auto space-y-3">
          {#each chatHistory as turn}
            <div class={turn.role === 'user' ? 'text-ink' : 'text-sub'}>
              <div class="text-xs uppercase tracking-wide mb-1 {turn.role === 'user' ? 'text-accent' : 'text-sub'}">
                {turn.role === 'user' ? 'You' : 'Interviewer'}
              </div>
              <div class="whitespace-pre-wrap text-sm">{turn.content}</div>
            </div>
          {/each}
          {#if chatHistory.length === 0}
            <div class="text-sub italic text-sm">Click Start Mock — interviewer will open with a question.</div>
          {/if}
          {#if chatLoading}
            <div class="text-sub italic text-sm">interviewer is thinking…</div>
          {/if}
        </div>

        <form onsubmit={(e) => { e.preventDefault(); sendChat(); }} class="flex gap-2 mt-3">
          <input bind:value={chatInput} placeholder="Your answer…" class="flex-1 bg-panel border border-line rounded px-3 py-2 text-sm" disabled={chatLoading || chatHistory.length === 0} />
          <button type="submit" disabled={chatLoading || !chatInput.trim() || chatHistory.length === 0} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">Send</button>
        </form>
      {/if}

      {#if activePanel === 'negotiation'}
        <div class="space-y-3">
          <label class="text-sm text-sub">Paste offer details (base / equity / bonus / location / start date / competing offers):</label>
          <textarea bind:value={offerInput} class="w-full bg-panel border border-line rounded px-3 py-2 text-sm font-mono min-h-[120px]"></textarea>
          <button onclick={getNegotiation} disabled={negotiationLoading || !offerInput.trim()} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {negotiationLoading ? 'Generating...' : 'Generate Negotiation Brief'}
          </button>
          {#if negotiationContent}
            <article class="prose prose-invert max-w-none mt-4">
              {@html negotiationHtml}
            </article>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="text-sub mt-4">Job not found.</div>
  {/if}
</div>
