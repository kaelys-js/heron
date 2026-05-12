<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    KeyRound,
    ArrowRight,
    ExternalLink,
    CheckCircle2,
    AlertCircle,
    Loader2,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';

  let {
    data,
  }: {
    data: {
      profileId: string;
      masked: Record<string, string>;
      hasRequiredKeys: boolean;
      isAdditionalProfile: boolean;
    };
  } = $props();
  let q = $derived('?profile=' + encodeURIComponent(data.profileId));

  /** When the user is onboarding their 2nd+ profile AND all required API
   *  keys are already configured (carried over from the first profile),
   *  this step is essentially a no-op. We surface a "Keys already
   *  configured — continue" path that skips ahead. The user can still
   *  expand and edit if they want different keys for this profile,
   *  but defaults to one click forward. */
  let canSkipApiKeys = $derived(data.isAdditionalProfile && data.hasRequiredKeys);
  let expanded = $state(false);

  async function skipApiKeys() {
    if (saving) return;
    saving = true;
    try {
      await api.post(
        '/api/onboarding/step',
        { step: 'api-keys', action: 'skip' },
        { silent: true },
      );
      await goto('/onboarding/identity' + q);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not advance', { description: err.message });
      saving = false;
    }
  }

  // Pre-populate empty fields; if a key is already masked (****abcd), we
  // keep that as the placeholder and let the user choose to replace it.
  let pending = $state<Record<string, string>>({});
  let probing = $state<Record<string, boolean>>({});
  let probeResult = $state<Record<string, { ok: boolean; message: string } | null>>({
    anthropic: null,
    gemini: null,
    adzuna: null,
  });
  let saving = $state(false);

  function isSet(key: string): boolean {
    return !!data.masked[key] && data.masked[key].startsWith('****');
  }

  async function probe(provider: 'anthropic' | 'gemini' | 'adzuna') {
    if (probing[provider]) return;
    probing = { ...probing, [provider]: true };
    try {
      const r = await api.post<{ ok: boolean; provider: string; message: string }>(
        '/api/settings/test',
        { provider },
        { silent: true },
      );
      probeResult = { ...probeResult, [provider]: { ok: r.ok, message: r.message } };
    } catch (e) {
      const err = e as ApiError;
      probeResult = { ...probeResult, [provider]: { ok: false, message: err.message } };
    } finally {
      probing = { ...probing, [provider]: false };
    }
  }

  async function saveAndContinue() {
    if (saving) return;
    // Anthropic is required. Either it's already set OR we're saving a new value.
    const anthropicEffective =
      pending.ANTHROPIC_API_KEY || (isSet('ANTHROPIC_API_KEY') ? '****' : '');
    if (!anthropicEffective) {
      toast.error('Anthropic API key required', {
        description:
          'Used for deep job evaluations + agent chat. Get one free at console.anthropic.com.',
      });
      return;
    }
    saving = true;
    try {
      // Filter out empty strings + masked sentinel values; pass only real new keys.
      const updates: Record<string, string> = {};
      for (const [k, v] of Object.entries(pending)) {
        if (v && !v.startsWith('****')) updates[k] = v;
      }
      if (Object.keys(updates).length > 0) {
        await api.post('/api/settings', updates, { silent: true });
      }
      // Probe the now-effective Anthropic key one last time before advancing.
      const r = await api.post<{ ok: boolean; message: string }>(
        '/api/settings/test',
        { provider: 'anthropic' },
        { silent: true },
      );
      if (!r.ok) {
        toast.error('Anthropic key invalid', { description: r.message });
        saving = false;
        return;
      }
      await api.post(
        '/api/onboarding/step',
        { step: 'api-keys', action: 'complete' },
        { silent: true },
      );
      toast.success('API keys verified');
      await goto('/onboarding/identity' + q);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not save', { description: err.message });
      saving = false;
    }
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <KeyRound class="size-5 text-amber-400" />
      API keys
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Anthropic powers the deep evaluation, agent chat, and CV-tailoring. Gemini is optional but
      recommended — its free tier covers ~1M tokens/day, used to score every new posting before
      Claude does the deep dive (saves a lot of money). Adzuna is a niche aggregator, only enable it
      if you want the extra source.
    </p>
  </header>

  {#if canSkipApiKeys && !expanded}
    <!-- 2nd+ profile + keys already configured. Express path. -->
    <div
      class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 flex items-start gap-3"
    >
      <CheckCircle2 class="size-5 text-emerald-400 mt-0.5 flex-shrink-0" />
      <div class="flex-1 space-y-2">
        <p class="text-sm font-medium text-emerald-200">Keys already configured</p>
        <p class="text-[11px] text-emerald-200/80 leading-relaxed">
          Anthropic + Gemini + Adzuna are shared across every profile, so the keys you set up on
          your first profile carry over. Click Continue to skip ahead — or expand to edit if you
          want different keys for this profile.
        </p>
        <div class="flex items-center gap-2 pt-1">
          <Button onclick={skipApiKeys} disabled={saving} class="gap-1.5" size="sm">
            {#if saving}<Loader2 class="size-3.5 animate-spin" /> Continuing…{:else}Continue<ArrowRight
                class="size-3.5"
              />{/if}
          </Button>
          <button
            type="button"
            onclick={() => (expanded = true)}
            class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
          >
            Edit keys instead
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="space-y-4">
      <!-- Anthropic — required -->
      <div class="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-2">
        <div class="flex items-center justify-between">
          <Label for="anthropic" class="text-sm font-medium flex items-center gap-1.5">
            Anthropic
            <span
              class="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300"
              >required</span
            >
          </Label>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Get a key <ExternalLink class="size-2.5" />
          </a>
        </div>
        <p class="text-[11px] text-muted-foreground">
          Powers deep evaluations + agent chat. Starts with <code class="font-mono"
            >sk-ant-api03-</code
          >.
        </p>
        <div class="flex items-center gap-2">
          <Input
            id="anthropic"
            type="password"
            placeholder={isSet('ANTHROPIC_API_KEY')
              ? data.masked.ANTHROPIC_API_KEY
              : 'sk-ant-api03-…'}
            bind:value={pending.ANTHROPIC_API_KEY}
            class="font-mono text-xs"
          />
          {#if isSet('ANTHROPIC_API_KEY') || pending.ANTHROPIC_API_KEY}
            <Button
              variant="outline"
              size="sm"
              class="h-9 gap-1.5 flex-shrink-0"
              onclick={() => probe('anthropic')}
              disabled={probing.anthropic}
            >
              {#if probing.anthropic}<Loader2 class="size-3 animate-spin" />{:else}Test{/if}
            </Button>
          {/if}
        </div>
        {#if probeResult.anthropic}
          {@const r = probeResult.anthropic}
          <div
            class={r.ok
              ? 'text-[11px] text-emerald-400 inline-flex items-center gap-1'
              : 'text-[11px] text-red-400 inline-flex items-center gap-1'}
          >
            {#if r.ok}<CheckCircle2 class="size-3" />{:else}<AlertCircle class="size-3" />{/if}
            {r.message}
          </div>
        {/if}
      </div>

      <!-- Gemini — recommended -->
      <div class="rounded-md border border-border/40 bg-card px-4 py-3 space-y-2">
        <div class="flex items-center justify-between">
          <Label for="gemini" class="text-sm font-medium"
            >Gemini <span class="text-[10px] text-muted-foreground/70">(recommended)</span></Label
          >
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener"
            class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Free key <ExternalLink class="size-2.5" />
          </a>
        </div>
        <p class="text-[11px] text-muted-foreground">
          First-pass scoring on the daily ~30 new postings. Free tier (1M tokens/day) is more than
          enough. Starts with <code class="font-mono">AIza</code>.
        </p>
        <div class="flex items-center gap-2">
          <Input
            id="gemini"
            type="password"
            placeholder={isSet('GEMINI_API_KEY') ? data.masked.GEMINI_API_KEY : 'AIza…'}
            bind:value={pending.GEMINI_API_KEY}
            class="font-mono text-xs"
          />
          {#if isSet('GEMINI_API_KEY') || pending.GEMINI_API_KEY}
            <Button
              variant="outline"
              size="sm"
              class="h-9 gap-1.5 flex-shrink-0"
              onclick={() => probe('gemini')}
              disabled={probing.gemini}
            >
              {#if probing.gemini}<Loader2 class="size-3 animate-spin" />{:else}Test{/if}
            </Button>
          {/if}
        </div>
        {#if probeResult.gemini}
          {@const r = probeResult.gemini}
          <div
            class={r.ok
              ? 'text-[11px] text-emerald-400 inline-flex items-center gap-1'
              : 'text-[11px] text-red-400 inline-flex items-center gap-1'}
          >
            {#if r.ok}<CheckCircle2 class="size-3" />{:else}<AlertCircle class="size-3" />{/if}
            {r.message}
          </div>
        {/if}
      </div>

      <!-- Adzuna — optional -->
      <details class="rounded-md border border-border/40 bg-card px-4 py-3 group">
        <summary class="cursor-pointer text-sm font-medium flex items-center justify-between">
          Adzuna <span class="text-[10px] text-muted-foreground/70">(optional)</span>
        </summary>
        <div class="mt-3 space-y-2">
          <p class="text-[11px] text-muted-foreground">
            Adds Adzuna to the JobSpy aggregator list. Only fill in if you specifically want
            Adzuna's coverage.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <Label for="adzuna-id" class="text-xs">App ID</Label>
              <Input
                id="adzuna-id"
                type="password"
                bind:value={pending.ADZUNA_APP_ID}
                class="font-mono text-xs"
                placeholder={isSet('ADZUNA_APP_ID') ? data.masked.ADZUNA_APP_ID : '8 hex chars'}
              />
            </div>
            <div>
              <Label for="adzuna-key" class="text-xs">App Key</Label>
              <Input
                id="adzuna-key"
                type="password"
                bind:value={pending.ADZUNA_APP_KEY}
                class="font-mono text-xs"
                placeholder={isSet('ADZUNA_APP_KEY') ? data.masked.ADZUNA_APP_KEY : '32 hex chars'}
              />
            </div>
          </div>
        </div>
      </details>
    </div>

    <div class="flex items-center justify-between pt-4 border-t border-border/40">
      <a href="/onboarding" class="text-xs text-muted-foreground hover:text-foreground">← Back</a>
      <Button onclick={saveAndContinue} disabled={saving} class="gap-1.5">
        {#if saving}<Loader2 class="size-3.5 animate-spin" /> Saving…{:else}Continue<ArrowRight
            class="size-4"
          />{/if}
      </Button>
    </div>
  {/if}
</div>
