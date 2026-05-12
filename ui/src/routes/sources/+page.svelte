<script lang="ts">
import Topbar from '$lib/components/Topbar.svelte';
import * as Card from '$lib/components/ui/card';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  Mail,
  Key,
  Database,
  Power,
  RefreshCw,
  ExternalLink,
} from '@lucide/svelte';
import { api, ApiError } from '$lib/api';
import { invalidateAll } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { withMinDuration, cn, formatRelativeTime } from '$lib/utils';
import type { KnownSource, SourceState } from '$lib/server/sources';

type Row = KnownSource & {
  state: SourceState;
  pulls: { last7d: number; total: number };
};

let { data }: { data: { sources: Row[] } } = $props();

let busy = $state<Record<string, 'connect' | 'test' | 'disconnect' | null>>({});

// Gmail-specific form state — only used by the gmail-imap card
let gmailForm = $state({
  host: 'imap.gmail.com',
  user: '',
  password: '',
  label: 'INBOX',
});

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

function authIcon(kind: KnownSource['authKind']) {
  if (kind === 'playwright') return Globe;
  if (kind === 'imap') return Mail;
  if (kind === 'env-key') return Key;
  return Database;
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

async function testSource(row: Row) {
  if (busy[row.id]) return;
  busy = { ...busy, [row.id]: 'test' };
  try {
    const r = await withMinDuration(
      api.post<{ ok: boolean; message?: string }>(
        '/api/sources/' + encodeURIComponent(row.id) + '/test',
        {},
        { silent: true },
      ),
      300,
    );
    toast.success(row.label + ' OK', { description: r.message ?? 'Probe succeeded.' });
    await invalidateAll();
  } catch (e) {
    const err = e as ApiError;
    toast.error('Test failed', { description: err.message, duration: 8_000 });
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
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Sources" subtitle="Connection state for every job source" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">

      <!-- Hero -->
      <div class="space-y-1.5 max-w-3xl">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Plug class="size-5 text-fuchsia-400" />
          Job sources
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          One card per scanner. Authenticated sources (LinkedIn, Indeed) keep your logged-in browser
          session in a persistent Playwright profile so we see the same personalized feed you'd
          see when scrolling LinkedIn yourself. Email ingestion polls a Gmail label via IMAP. The
          "always-on" aggregators run regardless — they're listed for completeness.
        </p>
      </div>

      <!-- Cards -->
      <div class="space-y-3">
        {#each data.sources as row (row.id)}
          {@const Icon = authIcon(row.authKind)}
          {@const status = statusLabel(row.state)}
          {@const b = busy[row.id]}
          <Card.Root class={cn('transition-colors', statusTint(row.state))}>
            <Card.Content class="px-4 py-3 flex items-start gap-3">
              <div class="size-8 rounded-md bg-muted/40 ring-1 ring-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon class="size-4 text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-sm font-semibold truncate">{row.label}</h3>
                  {#if row.required}
                    <span class="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">required</span>
                  {/if}
                </div>
                <p class="text-[11px] text-muted-foreground leading-relaxed">{row.description}</p>
                <div class="flex items-center gap-2 text-[11px] pt-1">
                  <span class={cn('size-1.5 rounded-full', status.dot)}></span>
                  <span class="text-muted-foreground">{status.text}</span>
                  {#if row.pulls.last7d > 0 || row.pulls.total > 0}
                    <span class="text-muted-foreground/60">·</span>
                    <span class="text-muted-foreground/80 font-mono">
                      {row.pulls.last7d.toLocaleString()} this week · {row.pulls.total.toLocaleString()} total
                    </span>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-1.5 flex-shrink-0">
                {#if row.authKind === 'always-on'}
                  <span class="text-[10px] text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 class="size-3" /> Active
                  </span>
                {:else if row.authKind === 'env-key'}
                  <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" onclick={() => testSource(row)} disabled={b !== null && b !== undefined}>
                    {#if b === 'test'}<Loader2 class="size-3 animate-spin" />{:else}<RefreshCw class="size-3" />{/if}
                    Test
                  </Button>
                  <a href="/settings" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Configure <ExternalLink class="size-2.5" />
                  </a>
                {:else if row.state.connected}
                  <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" onclick={() => testSource(row)} disabled={b !== null && b !== undefined}>
                    {#if b === 'test'}<Loader2 class="size-3 animate-spin" />{:else}<RefreshCw class="size-3" />{/if}
                    Test
                  </Button>
                  <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 text-red-400 hover:text-red-300" onclick={() => disconnectSource(row)} disabled={b !== null && b !== undefined}>
                    {#if b === 'disconnect'}<Loader2 class="size-3 animate-spin" />{:else}<Power class="size-3" />{/if}
                    Disconnect
                  </Button>
                {:else if row.authKind === 'imap' && row.id === 'gmail-imap'}
                  <!-- Gmail card: show a button that opens an inline form below.
                       The button itself does the form-collapse below; we just
                       render a "Connect" CTA that triggers a scroll/expand. -->
                  <Button size="sm" class="h-7 text-xs gap-1" onclick={() => connectSource(row)} disabled={b !== null && b !== undefined || !gmailForm.user || !gmailForm.password}>
                    {#if b === 'connect'}<Loader2 class="size-3 animate-spin" /> Testing…{:else}<Plug class="size-3" /> Connect{/if}
                  </Button>
                {:else}
                  <Button size="sm" class="h-7 text-xs gap-1" onclick={() => connectSource(row)} disabled={b !== null && b !== undefined}>
                    {#if b === 'connect'}<Loader2 class="size-3 animate-spin" /> Opening browser…{:else}<Plug class="size-3" /> Connect{/if}
                  </Button>
                {/if}
              </div>
            </Card.Content>

            {#if row.id === 'gmail-imap' && !row.state.connected}
              <Card.Content class="px-4 pb-3 pt-0 border-t border-border/40">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                  <div>
                    <Label for="gmail-host" class="text-xs">IMAP host</Label>
                    <Input id="gmail-host" bind:value={gmailForm.host} class="h-8 text-xs" />
                  </div>
                  <div>
                    <Label for="gmail-label" class="text-xs">Label / mailbox</Label>
                    <Input id="gmail-label" bind:value={gmailForm.label} class="h-8 text-xs" placeholder="INBOX" />
                  </div>
                  <div>
                    <Label for="gmail-user" class="text-xs">Email address</Label>
                    <Input id="gmail-user" type="email" bind:value={gmailForm.user} class="h-8 text-xs" placeholder="you@gmail.com" />
                  </div>
                  <div>
                    <Label for="gmail-password" class="text-xs">App password</Label>
                    <Input id="gmail-password" type="password" bind:value={gmailForm.password} class="h-8 text-xs font-mono" placeholder="xxxx xxxx xxxx xxxx" />
                  </div>
                </div>
                <p class="text-[10px] text-muted-foreground/80 mt-2 leading-relaxed">
                  Gmail requires a 16-character app password (not your regular password). Generate one at
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-foreground">myaccount.google.com/apppasswords</a>
                  — needs 2FA enabled on the account first. Stored locally in <code class="font-mono">.env</code>; never sent anywhere except your own Gmail server over TLS.
                </p>
              </Card.Content>
            {/if}

            {#if row.state.lastError && !row.state.connected}
              <Card.Content class="px-4 pb-3 pt-0">
                <div class="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 flex items-start gap-2">
                  <AlertCircle class="size-3 text-red-400 mt-0.5 flex-shrink-0" />
                  <p class="text-[11px] text-red-200/90 leading-relaxed font-mono break-all">{row.state.lastError}</p>
                </div>
              </Card.Content>
            {/if}
          </Card.Root>
        {/each}
      </div>
    </div>
  </div>
</div>
