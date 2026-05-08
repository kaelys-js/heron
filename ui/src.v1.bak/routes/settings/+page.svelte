<script lang="ts">
  let { data } = $props();
  let env = $state({ ...data.env });
  let saving = $state(false);
  let savedFlash = $state(false);

  async function save() {
    saving = true;
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env),
      });
      const j = await r.json();
      env = { ...j.current };
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 2000);
    } finally {
      saving = false;
    }
  }

  async function linkedinLogin() {
    await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'apply-linkedin-login' }),
    });
  }

  const fields = [
    { key: 'GEMINI_API_KEY', label: 'Gemini API key', help: 'Free tier at https://aistudio.google.com/apikey — required for first-pass scoring' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', help: 'Required for Interview Prep, Mock Interview, Negotiation panels' },
    { key: 'ADZUNA_APP_ID', label: 'Adzuna App ID', help: 'Optional — extra job source. Free at https://developer.adzuna.com' },
    { key: 'ADZUNA_APP_KEY', label: 'Adzuna App Key', help: 'Optional — paired with App ID' },
  ];
</script>

<div class="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-semibold mb-1">Settings</h1>
  <div class="text-sub text-sm mb-6">API keys are stored in <code class="text-accent">~/career-ops/.env</code></div>

  <div class="space-y-4">
    {#each fields as f}
      <div class="bg-panel/40 border border-line rounded p-4">
        <label class="block text-sm font-medium text-ink mb-1">{f.label}</label>
        <input
          type="text"
          bind:value={env[f.key]}
          placeholder={env[f.key] && env[f.key].startsWith('****') ? env[f.key] : 'paste new value to update'}
          class="w-full bg-bg border border-line rounded px-3 py-2 text-sm font-mono"
        />
        <div class="text-xs text-sub mt-1">{f.help}</div>
      </div>
    {/each}
  </div>

  <button onclick={save} disabled={saving} class="mt-6 px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
    {saving ? 'Saving...' : savedFlash ? '✓ Saved' : 'Save'}
  </button>

  <div class="mt-10 border-t border-line pt-6">
    <h2 class="text-lg font-semibold mb-1">LinkedIn Easy Apply</h2>
    <div class="text-sub text-sm mb-3">
      One-time setup: log in to LinkedIn so the automation has session cookies.
      A browser window opens — you log in manually, then return.
    </div>
    <button onclick={linkedinLogin} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30">
      Login to LinkedIn for Easy Apply
    </button>
  </div>

  <div class="mt-10 border-t border-line pt-6 text-sub text-sm">
    <h2 class="text-lg font-semibold text-ink mb-2">Restart Note</h2>
    <div>Some environment changes require a server restart. After saving keys, restart <code class="text-accent">pnpm go</code> to ensure they're loaded into all child processes.</div>
  </div>
</div>
