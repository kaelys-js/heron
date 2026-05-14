<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Plug,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Loader2,
    Globe,
    Mail,
    Briefcase,
    AlertCircle,
    Power,
    ExternalLink,
    ChevronDown,
    Database,
  } from '@lucide/svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { withMinDuration, cn, formatRelativeTime } from '$lib/utils';
  import type { KnownSource, SourceState } from '$lib/server/sources';

  type Row = KnownSource & { state: SourceState };

  let { data }: { data: { sources: Row[]; profileId: string; anyConnected: boolean } } = $props();
  let q = $derived('?profile=' + encodeURIComponent(data.profileId));

  let busy = $state<Record<string, 'connect' | 'test' | 'disconnect' | null>>({});

  let gmailForm = $state({
    host: 'imap.gmail.com',
    user: '',
    password: '',
    label: 'INBOX',
  });
  let appPasswordHelp = $state(false);
  let advancing = $state(false);

  // Slice the source list into the three pitches the onboarding step makes.
  let linkedin = $derived(data.sources.find((s) => s.id === 'linkedin-auth'));
  let indeed = $derived(data.sources.find((s) => s.id === 'indeed-auth'));
  let gmail = $derived(data.sources.find((s) => s.id === 'gmail-imap'));
  let alwaysOn = $derived(data.sources.filter((s) => s.authKind === 'always-on'));
  let connectedCount = $derived([linkedin, indeed, gmail].filter((s) => s?.state.connected).length);

  function statusTint(state: SourceState): string {
    if (state.connected && state.consecutiveFailures === 0)
      return 'border-emerald-500/40 bg-emerald-500/5';
    if (state.connected) return 'border-amber-500/40 bg-amber-500/5';
    if (state.consecutiveFailures > 0) return 'border-red-500/40 bg-red-500/5';
    return 'border-border/40 bg-card';
  }

  function statusLabel(state: SourceState): { dot: string; text: string } {
    if (state.connected && state.consecutiveFailures === 0) {
      const ago = state.lastSuccessfulPullAt
        ? formatRelativeTime(state.lastSuccessfulPullAt) + ' ago'
        : '';
      return { dot: 'bg-emerald-500', text: 'Connected' + (ago ? ' · last pull ' + ago : '') };
    }
    if (state.connected) {
      return {
        dot: 'bg-amber-500',
        text:
          'Connected · ' +
          state.consecutiveFailures +
          ' recent failure' +
          (state.consecutiveFailures === 1 ? '' : 's'),
      };
    }
    if (state.consecutiveFailures > 0) {
      return {
        dot: 'bg-red-500',
        text: 'Disconnected — ' + (state.lastError ?? 'failed ' + state.consecutiveFailures + 'x'),
      };
    }
    return { dot: 'bg-zinc-500', text: 'Not connected' };
  }

  async function connectSource(row: Row) {
    if (busy[row.id]) return;
    busy = { ...busy, [row.id]: 'connect' };
    try {
      const body: Record<string, unknown> = {};
      if (row.id === 'gmail-imap') Object.assign(body, gmailForm);
      const r = await withMinDuration(
        api.post<{ ok: boolean; message?: string }>(
          '/api/sources/' + encodeURIComponent(row.id) + '/connect',
          body,
          { silent: true },
        ),
        500,
      );
      toast.success(row.label + ' connected', { description: r.message });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Connect failed', {
        description: err.message,
        action: { label: 'Retry', onClick: () => connectSource(row) },
        duration: 12_000,
      });
    } finally {
      busy = { ...busy, [row.id]: null };
    }
  }

  async function disconnectSource(row: Row) {
    if (busy[row.id]) return;
    if (!confirm('Disconnect ' + row.label + "? You'll need to re-authenticate.")) return;
    busy = { ...busy, [row.id]: 'disconnect' };
    try {
      await api.post(
        '/api/sources/' + encodeURIComponent(row.id) + '/disconnect',
        {},
        { silent: true },
      );
      toast.info(row.label + ' disconnected');
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Disconnect failed', { description: err.message });
    } finally {
      busy = { ...busy, [row.id]: null };
    }
  }

  async function continueToScan(action: 'complete' | 'skip') {
    if (advancing) return;
    advancing = true;
    try {
      await api.post('/api/onboarding/step', { step: 'sources', action }, { silent: true });
      await goto('/onboarding/first-scan' + q);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not advance', { description: err.message });
      advancing = false;
    }
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <Plug class="size-5 text-fuchsia-400" />
      Sources
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Connect the personal sources for fuller coverage. LinkedIn + Indeed scrape your <em
        >logged-in</em
      >
      feed via a saved Playwright browser session — same view you'd see scrolling LinkedIn yourself, no
      API keys, no OAuth. Gmail polls a label for job-alert emails. All three are optional — skip any
      and the daily scan still runs against the always-on aggregators.
    </p>
  </header>

  <!-- LinkedIn -->
  {#if linkedin}
    {@const row = linkedin}
    {@const status = statusLabel(row.state)}
    {@const b = busy[row.id]}
    <div class={cn('rounded-md border px-4 py-3 transition-colors', statusTint(row.state))}>
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-md bg-blue-500/10 ring-1 ring-blue-500/30 flex items-center justify-center flex-shrink-0"
        >
          <Briefcase class="size-4 text-blue-400" />
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-semibold">LinkedIn</h3>
            <span
              class="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              >recommended</span
            >
          </div>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            Personalized feed (vs the partial public scrape JobSpy gets). We launch a real Chromium
            browser, you log in once, the session is saved for the daily scan. ToS-clean for
            personal use, $0 ongoing.
          </p>
          <div class="flex items-center gap-2 text-[11px] pt-1">
            <span class={cn('size-1.5 rounded-full', status.dot)}></span>
            <span class="text-muted-foreground">{status.text}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          {#if row.state.connected}
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1 text-red-400 hover:text-red-300"
              onclick={() => disconnectSource(row)}
              disabled={b !== null && b !== undefined}
            >
              {#if b === 'disconnect'}<Loader2 class="size-3 animate-spin" />{:else}<Power
                  class="size-3"
                />{/if}
              Disconnect
            </Button>
          {:else}
            <Button
              size="sm"
              class="h-7 text-xs gap-1"
              onclick={() => connectSource(row)}
              disabled={b !== null && b !== undefined}
            >
              {#if b === 'connect'}<Loader2 class="size-3 animate-spin" /> Opening browser…{:else}<Plug
                  class="size-3"
                /> Connect{/if}
            </Button>
          {/if}
        </div>
      </div>
      {#if row.state.lastError && !row.state.connected}
        <div
          class="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 mt-3 flex items-start gap-2"
        >
          <AlertCircle class="size-3 text-red-400 mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-red-200/90 leading-relaxed font-mono break-all">
            {row.state.lastError}
          </p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Indeed -->
  {#if indeed}
    {@const row = indeed}
    {@const status = statusLabel(row.state)}
    {@const b = busy[row.id]}
    <div class={cn('rounded-md border px-4 py-3 transition-colors', statusTint(row.state))}>
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-md bg-indigo-500/10 ring-1 ring-indigo-500/30 flex items-center justify-center flex-shrink-0"
        >
          <Globe class="size-4 text-indigo-400" />
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-semibold">Indeed</h3>
            <span
              class="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              >recommended</span
            >
          </div>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            Same authenticated approach for Indeed. Bypasses the captcha gate that public scrapers
            hit, same daily scan rhythm. Login is one-time.
          </p>
          <div class="flex items-center gap-2 text-[11px] pt-1">
            <span class={cn('size-1.5 rounded-full', status.dot)}></span>
            <span class="text-muted-foreground">{status.text}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          {#if row.state.connected}
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1 text-red-400 hover:text-red-300"
              onclick={() => disconnectSource(row)}
              disabled={b !== null && b !== undefined}
            >
              {#if b === 'disconnect'}<Loader2 class="size-3 animate-spin" />{:else}<Power
                  class="size-3"
                />{/if}
              Disconnect
            </Button>
          {:else}
            <Button
              size="sm"
              class="h-7 text-xs gap-1"
              onclick={() => connectSource(row)}
              disabled={b !== null && b !== undefined}
            >
              {#if b === 'connect'}<Loader2 class="size-3 animate-spin" /> Opening browser…{:else}<Plug
                  class="size-3"
                /> Connect{/if}
            </Button>
          {/if}
        </div>
      </div>
      {#if row.state.lastError && !row.state.connected}
        <div
          class="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 mt-3 flex items-start gap-2"
        >
          <AlertCircle class="size-3 text-red-400 mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-red-200/90 leading-relaxed font-mono break-all">
            {row.state.lastError}
          </p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Gmail IMAP -->
  {#if gmail}
    {@const row = gmail}
    {@const status = statusLabel(row.state)}
    {@const b = busy[row.id]}
    <div
      class={cn('rounded-md border px-4 py-3 transition-colors space-y-3', statusTint(row.state))}
    >
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 flex items-center justify-center flex-shrink-0"
        >
          <Mail class="size-4 text-rose-400" />
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-semibold">Gmail (job alerts)</h3>
            <span
              class="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-zinc-500/40 bg-zinc-500/10 text-muted-foreground"
              >optional</span
            >
          </div>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            Polls a Gmail label every 30 min via IMAP. Set up a Gmail filter that auto-labels
            LinkedIn / Indeed alert emails, point us at the label, and we ingest them in real-time.
            Faster than waiting on the daily scrape; catches alerts you'd otherwise miss.
          </p>
          <div class="flex items-center gap-2 text-[11px] pt-1">
            <span class={cn('size-1.5 rounded-full', status.dot)}></span>
            <span class="text-muted-foreground">{status.text}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          {#if row.state.connected}
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1 text-red-400 hover:text-red-300"
              onclick={() => disconnectSource(row)}
              disabled={b !== null && b !== undefined}
            >
              {#if b === 'disconnect'}<Loader2 class="size-3 animate-spin" />{:else}<Power
                  class="size-3"
                />{/if}
              Disconnect
            </Button>
          {:else}
            <Button
              size="sm"
              class="h-7 text-xs gap-1"
              onclick={() => connectSource(row)}
              disabled={(b !== null && b !== undefined) || !gmailForm.user || !gmailForm.password}
            >
              {#if b === 'connect'}<Loader2 class="size-3 animate-spin" /> Testing…{:else}<Plug
                  class="size-3"
                /> Test & save{/if}
            </Button>
          {/if}
        </div>
      </div>

      {#if !row.state.connected}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/40">
          <div>
            <Label for="gmail-host" class="text-xs">IMAP host</Label>
            <Input id="gmail-host" bind:value={gmailForm.host} class="h-8 text-xs" />
          </div>
          <div>
            <Label for="gmail-label" class="text-xs">Label / mailbox</Label>
            <Input
              id="gmail-label"
              bind:value={gmailForm.label}
              class="h-8 text-xs"
              placeholder="INBOX or Career Ops/job-alerts"
            />
          </div>
          <div>
            <Label for="gmail-user" class="text-xs">Email address</Label>
            <Input
              id="gmail-user"
              type="email"
              bind:value={gmailForm.user}
              class="h-8 text-xs"
              placeholder="you@gmail.com"
            />
          </div>
          <div>
            <Label for="gmail-password" class="text-xs">App password</Label>
            <Input
              id="gmail-password"
              type="password"
              bind:value={gmailForm.password}
              class="h-8 text-xs font-mono"
              placeholder="xxxx xxxx xxxx xxxx"
            />
          </div>
        </div>

        <button
          type="button"
          class="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground py-1"
          onclick={() => (appPasswordHelp = !appPasswordHelp)}
          aria-expanded={appPasswordHelp}
        >
          <span class="inline-flex items-center gap-1">
            <ChevronDown
              class={cn('size-3 transition-transform', appPasswordHelp && 'rotate-180')}
            />
            How do I get an app password?
          </span>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 hover:text-foreground"
            onclick={(e) => e.stopPropagation()}
          >
            Open in Google <ExternalLink class="size-2.5" />
          </a>
        </button>
        {#if appPasswordHelp}
          <ol
            class="list-decimal pl-5 text-[11px] text-muted-foreground/90 space-y-1 leading-relaxed"
          >
            <li>
              Enable 2-factor auth on the Google account if you haven't already (required for app
              passwords).
            </li>
            <li>
              Visit <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener"
                class="underline underline-offset-2 hover:text-foreground"
                >myaccount.google.com/apppasswords</a
              >. Pick "Mail" + "Other (custom name)" → "Career Ops".
            </li>
            <li>
              Copy the 16-character password and paste it above. Stored locally in <code
                class="font-mono">.env</code
              >; never sent anywhere except your own Gmail server over TLS.
            </li>
            <li>
              Optional: in Gmail create a filter that auto-applies a label to LinkedIn/Indeed alert
              emails (e.g. "Career Ops/job-alerts"), then point this card at that label instead of
              INBOX.
            </li>
          </ol>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Always-on aggregators (informational) -->
  {#if alwaysOn.length > 0}
    <div class="rounded-md border border-border/40 bg-muted/20 px-4 py-3 space-y-2">
      <div class="flex items-center gap-1.5">
        <CheckCircle2 class="size-3.5 text-emerald-400" />
        <h3 class="text-xs font-semibold">Always-on (no setup)</h3>
      </div>
      <p class="text-[11px] text-muted-foreground leading-relaxed">
        These run regardless — listed here so you know what's covered. The daily fan-out hits all of
        them.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        {#each alwaysOn as src (src.id)}
          <div class="rounded border border-border/40 bg-card px-2.5 py-1.5">
            <div class="flex items-center gap-1.5">
              <Database class="size-3 text-muted-foreground/70" />
              <span class="text-[11px] font-medium">{src.label}</span>
            </div>
            <p class="text-[11px] text-muted-foreground/80 leading-relaxed mt-0.5 line-clamp-2">
              {src.description}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <a
      href="/onboarding/targeting"
      class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
    >
      <ArrowLeft class="size-3" /> Back
    </a>
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
        onclick={() => continueToScan('skip')}
        disabled={advancing}
      >
        Skip — connect later
      </button>
      <Button onclick={() => continueToScan('complete')} disabled={advancing} class="gap-1.5">
        {#if advancing}
          <Loader2 class="size-3.5 animate-spin" /> Loading…
        {:else}
          {connectedCount > 0 ? 'Continue (' + connectedCount + ' connected)' : 'Continue'}
          <ArrowRight class="size-4" />
        {/if}
      </Button>
    </div>
  </div>
</div>
