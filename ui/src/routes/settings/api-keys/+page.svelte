<script lang="ts">
  /**
   * /settings/api-keys -- per-user encrypted credentials.
   *
   * Each authenticated user manages THEIR OWN provider keys here.
   * Distinct from /settings which is owner-only and shows install-wide
   * env + backups.
   *
   * The form mirrors the provider sections the /settings page exposes
   * to the owner, but every read/write goes through /api/settings/secrets
   * (per-user encrypted store at data/users/{uid}/profiles/_shared/
   * secrets.json) instead of the install-wide .env. See AGENTS.md for
   * the contract.
   */
  import Topbar from '$lib/components/Topbar.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import { toast } from 'svelte-sonner';
  import { api } from '$lib/api';
  import {
    CheckCircle2,
    AlertCircle,
    KeyRound,
    Eye,
    EyeOff,
    Loader2,
    ExternalLink,
    Trash2,
  } from '@lucide/svelte';

  /** Seed from the SSR loader so the form paints without a flash. After
   *  the first save the local `current` state takes over (the server
   *  returns the fresh masked snapshot in the POST response). */
  let { data }: { data: { secrets: Record<string, string> } } = $props();

  /** Last known server state per key. Updated on every successful save
   *  / delete from `{current: ...}` in the response. */
  // svelte-ignore state_referenced_locally -- data.secrets is intentionally the seed; current takes over after save.
  let current = $state<Record<string, string>>({ ...data.secrets });

  /** Local edits -- what the user has typed but not yet saved. */
  let pending = $state<Record<string, string>>({});

  /** Per-field "show value as you type" toggle. Defaults off so a
   *  shoulder-surfer can't read the key on entry. */
  let revealed = $state<Record<string, boolean>>({});

  let saving = $state(false);
  let deletingKey = $state<string | null>(null);

  type ProbeOutcome = { ok: boolean; message: string };
  let probes = $state<Record<string, ProbeOutcome | null>>({
    anthropic: null,
    gemini: null,
    adzuna: null,
  });
  let probing = $state<Record<string, boolean>>({
    anthropic: false,
    gemini: false,
    adzuna: false,
  });

  /** Snapshot the original masked value so we can suppress empty saves
   *  on fields the user touched but didn't actually change. */
  function effectiveValue(key: string): string {
    const v = pending[key];
    return v !== undefined ? v : '';
  }

  /** True when the field has been edited away from its server value. */
  function isDirty(key: string): boolean {
    const seed = current[key] ?? '';
    const draft = pending[key];
    if (draft === undefined) return false;
    return draft !== seed;
  }

  function setPending(key: string, value: string) {
    pending[key] = value;
  }

  async function saveAll() {
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(pending)) {
      // Only send fields the user actually edited. Skip masked round-
      // trips ("****…") because that's the same string the form
      // pre-populated with -- sending it would no-op server-side anyway,
      // but conserving payload helps audit trails.
      if (typeof v !== 'string') continue;
      if (v.startsWith('****')) continue;
      const seed = current[k] ?? '';
      if (v === seed) continue;
      updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      toast.info('No changes to save.');
      return;
    }
    saving = true;
    try {
      const res = await api.post<{ current: Record<string, string> }>(
        '/api/settings/secrets',
        updates,
      );
      current = { ...current, ...res.current };
      pending = {};
      toast.success('API keys saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Save failed: ' + msg);
    } finally {
      saving = false;
    }
  }

  async function deleteKey(key: string) {
    deletingKey = key;
    try {
      const res = await api.delete<{ current: Record<string, string> }>(
        '/api/settings/secrets?key=' + encodeURIComponent(key),
      );
      current = { ...current, ...res.current };
      delete pending[key];
      toast.success(key + ' removed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Delete failed: ' + msg);
    } finally {
      deletingKey = null;
    }
  }

  async function probe(provider: 'anthropic' | 'gemini' | 'adzuna') {
    probing[provider] = true;
    probes[provider] = null;
    try {
      const r = await api.post<ProbeOutcome>('/api/settings/test', { provider });
      probes[provider] = r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      probes[provider] = { ok: false, message: msg };
    } finally {
      probing[provider] = false;
    }
  }

  function toggleReveal(key: string) {
    revealed[key] = !revealed[key];
  }

  /** Render the masked-or-pending value into the input. While editing,
   *  the user sees what they typed (reveal toggles off otherwise). */
  function displayValue(key: string): string {
    if (pending[key] !== undefined) return pending[key];
    return current[key] ?? '';
  }
</script>

<svelte:head>
  <title>API Keys · Settings</title>
</svelte:head>

<div class="flex h-full flex-col">
  <Topbar title="API Keys" subtitle="Per-user encrypted credentials" />

  <main class="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
    <div class="space-y-2">
      <h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <KeyRound class="h-5 w-5" />
        API Keys
      </h1>
      <p class="text-sm text-muted-foreground">
        Your personal credentials. Stored encrypted at-rest under your user directory; never shared
        with other users on this install. Settings here override install-wide values from
        <code class="font-mono text-xs">.env</code> when present.
      </p>
    </div>

    <!-- Anthropic -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-start justify-between gap-3">
          <div>
            <Card.Title>Anthropic</Card.Title>
            <Card.Description>
              Powers Claude — evaluations, agent chat, CV tailoring, cover letters.
            </Card.Description>
          </div>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            Get a key <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="space-y-2">
          <Label for="ANTHROPIC_API_KEY">API key</Label>
          <div class="flex gap-2">
            <Input
              id="ANTHROPIC_API_KEY"
              type={revealed['ANTHROPIC_API_KEY'] ? 'text' : 'password'}
              placeholder="sk-ant-…"
              value={displayValue('ANTHROPIC_API_KEY')}
              oninput={(e) => setPending('ANTHROPIC_API_KEY', (e.target as HTMLInputElement).value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onclick={() => toggleReveal('ANTHROPIC_API_KEY')}
              aria-label={revealed['ANTHROPIC_API_KEY'] ? 'Hide' : 'Show'}
            >
              {#if revealed['ANTHROPIC_API_KEY']}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </Button>
            {#if current['ANTHROPIC_API_KEY']}
              <Button
                variant="ghost"
                size="icon"
                onclick={() => deleteKey('ANTHROPIC_API_KEY')}
                disabled={deletingKey === 'ANTHROPIC_API_KEY'}
                aria-label="Remove"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => probe('anthropic')}
            disabled={probing.anthropic || !current['ANTHROPIC_API_KEY']}
          >
            {#if probing.anthropic}<Loader2 class="mr-2 h-3 w-3 animate-spin" />{/if}
            Test connection
          </Button>
          {#if probes.anthropic}
            <div
              class="flex items-center gap-1 text-xs {probes.anthropic.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'}"
            >
              {#if probes.anthropic.ok}
                <CheckCircle2 class="h-3 w-3" />
              {:else}
                <AlertCircle class="h-3 w-3" />
              {/if}
              {probes.anthropic.message}
            </div>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Gemini -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-start justify-between gap-3">
          <div>
            <Card.Title>Gemini</Card.Title>
            <Card.Description>
              First-pass scoring on new postings (cuts Claude costs ~10×). Free tier available.
            </Card.Description>
          </div>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            Get a free key <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="space-y-2">
          <Label for="GEMINI_API_KEY">API key</Label>
          <div class="flex gap-2">
            <Input
              id="GEMINI_API_KEY"
              type={revealed['GEMINI_API_KEY'] ? 'text' : 'password'}
              placeholder="AIza…"
              value={displayValue('GEMINI_API_KEY')}
              oninput={(e) => setPending('GEMINI_API_KEY', (e.target as HTMLInputElement).value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onclick={() => toggleReveal('GEMINI_API_KEY')}
              aria-label={revealed['GEMINI_API_KEY'] ? 'Hide' : 'Show'}
            >
              {#if revealed['GEMINI_API_KEY']}<EyeOff class="h-4 w-4" />{:else}<Eye
                  class="h-4 w-4"
                />{/if}
            </Button>
            {#if current['GEMINI_API_KEY']}
              <Button
                variant="ghost"
                size="icon"
                onclick={() => deleteKey('GEMINI_API_KEY')}
                disabled={deletingKey === 'GEMINI_API_KEY'}
                aria-label="Remove"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
        <div class="space-y-2">
          <Label for="GEMINI_MODEL">Model (optional override)</Label>
          <Input
            id="GEMINI_MODEL"
            type="text"
            placeholder="gemini-2.0-flash (default)"
            value={displayValue('GEMINI_MODEL')}
            oninput={(e) => setPending('GEMINI_MODEL', (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => probe('gemini')}
            disabled={probing.gemini || !current['GEMINI_API_KEY']}
          >
            {#if probing.gemini}<Loader2 class="mr-2 h-3 w-3 animate-spin" />{/if}
            Test connection
          </Button>
          {#if probes.gemini}
            <div
              class="flex items-center gap-1 text-xs {probes.gemini.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'}"
            >
              {#if probes.gemini.ok}<CheckCircle2 class="h-3 w-3" />{:else}<AlertCircle
                  class="h-3 w-3"
                />{/if}
              {probes.gemini.message}
            </div>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Adzuna -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-start justify-between gap-3">
          <div>
            <Card.Title>Adzuna</Card.Title>
            <Card.Description>
              Optional. Adds Adzuna to the job-search aggregator list.
            </Card.Description>
          </div>
          <a
            href="https://developer.adzuna.com"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            Sign up <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="ADZUNA_APP_ID">App ID</Label>
            <Input
              id="ADZUNA_APP_ID"
              type="text"
              value={displayValue('ADZUNA_APP_ID')}
              oninput={(e) => setPending('ADZUNA_APP_ID', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="space-y-2">
            <Label for="ADZUNA_APP_KEY">App key</Label>
            <div class="flex gap-2">
              <Input
                id="ADZUNA_APP_KEY"
                type={revealed['ADZUNA_APP_KEY'] ? 'text' : 'password'}
                value={displayValue('ADZUNA_APP_KEY')}
                oninput={(e) => setPending('ADZUNA_APP_KEY', (e.target as HTMLInputElement).value)}
              />
              <Button
                variant="ghost"
                size="icon"
                onclick={() => toggleReveal('ADZUNA_APP_KEY')}
                aria-label={revealed['ADZUNA_APP_KEY'] ? 'Hide' : 'Show'}
              >
                {#if revealed['ADZUNA_APP_KEY']}<EyeOff class="h-4 w-4" />{:else}<Eye
                    class="h-4 w-4"
                  />{/if}
              </Button>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => probe('adzuna')}
            disabled={probing.adzuna || !current['ADZUNA_APP_ID'] || !current['ADZUNA_APP_KEY']}
          >
            {#if probing.adzuna}<Loader2 class="mr-2 h-3 w-3 animate-spin" />{/if}
            Test connection
          </Button>
          {#if probes.adzuna}
            <div
              class="flex items-center gap-1 text-xs {probes.adzuna.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'}"
            >
              {#if probes.adzuna.ok}<CheckCircle2 class="h-3 w-3" />{:else}<AlertCircle
                  class="h-3 w-3"
                />{/if}
              {probes.adzuna.message}
            </div>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- OpenAI -->
    <Card.Root>
      <Card.Header>
        <Card.Title>OpenAI</Card.Title>
        <Card.Description>Optional. Reserved for future provider integrations.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="space-y-2">
          <Label for="OPENAI_API_KEY">API key</Label>
          <div class="flex gap-2">
            <Input
              id="OPENAI_API_KEY"
              type={revealed['OPENAI_API_KEY'] ? 'text' : 'password'}
              placeholder="sk-…"
              value={displayValue('OPENAI_API_KEY')}
              oninput={(e) => setPending('OPENAI_API_KEY', (e.target as HTMLInputElement).value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onclick={() => toggleReveal('OPENAI_API_KEY')}
              aria-label={revealed['OPENAI_API_KEY'] ? 'Hide' : 'Show'}
            >
              {#if revealed['OPENAI_API_KEY']}<EyeOff class="h-4 w-4" />{:else}<Eye
                  class="h-4 w-4"
                />{/if}
            </Button>
            {#if current['OPENAI_API_KEY']}
              <Button
                variant="ghost"
                size="icon"
                onclick={() => deleteKey('OPENAI_API_KEY')}
                disabled={deletingKey === 'OPENAI_API_KEY'}
                aria-label="Remove"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Gmail IMAP -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Gmail (IMAP)</Card.Title>
        <Card.Description>
          Real-time job-alert ingestion via app password. Generate an app password at
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener"
            class="underline hover:no-underline">myaccount.google.com/apppasswords</a
          >
          after enabling 2FA.
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="GMAIL_IMAP_HOST">Host</Label>
            <Input
              id="GMAIL_IMAP_HOST"
              type="text"
              placeholder="imap.gmail.com (default)"
              value={displayValue('GMAIL_IMAP_HOST')}
              oninput={(e) => setPending('GMAIL_IMAP_HOST', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="space-y-2">
            <Label for="GMAIL_IMAP_USER">Email address</Label>
            <Input
              id="GMAIL_IMAP_USER"
              type="email"
              placeholder="you@gmail.com"
              value={displayValue('GMAIL_IMAP_USER')}
              oninput={(e) => setPending('GMAIL_IMAP_USER', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label for="GMAIL_IMAP_PASSWORD">App password</Label>
            <div class="flex gap-2">
              <Input
                id="GMAIL_IMAP_PASSWORD"
                type={revealed['GMAIL_IMAP_PASSWORD'] ? 'text' : 'password'}
                placeholder="xxxx xxxx xxxx xxxx"
                value={displayValue('GMAIL_IMAP_PASSWORD')}
                oninput={(e) =>
                  setPending('GMAIL_IMAP_PASSWORD', (e.target as HTMLInputElement).value)}
              />
              <Button
                variant="ghost"
                size="icon"
                onclick={() => toggleReveal('GMAIL_IMAP_PASSWORD')}
                aria-label={revealed['GMAIL_IMAP_PASSWORD'] ? 'Hide' : 'Show'}
              >
                {#if revealed['GMAIL_IMAP_PASSWORD']}<EyeOff class="h-4 w-4" />{:else}<Eye
                    class="h-4 w-4"
                  />{/if}
              </Button>
            </div>
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label for="GMAIL_IMAP_LABEL">Label</Label>
            <Input
              id="GMAIL_IMAP_LABEL"
              type="text"
              placeholder="INBOX (default)"
              value={displayValue('GMAIL_IMAP_LABEL')}
              oninput={(e) => setPending('GMAIL_IMAP_LABEL', (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Save bar -->
    <div
      class="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted-foreground">
          Changes save to your encrypted per-user store. Other users on this install never see your
          keys.
        </p>
        <Button onclick={saveAll} disabled={saving}>
          {#if saving}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
          Save changes
        </Button>
      </div>
    </div>
  </main>
</div>
