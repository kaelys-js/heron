<script lang="ts">
  import { docTitle } from '$lib/config/branding';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Copy, Check, Send, Archive } from '@lucide/svelte';
  import { renderMarkdown } from '$lib/client/safe-markdown';

  let { data } = $props();

  let busy = $state<string | null>(null);
  let copied = $state(false);
  let tone = $state<'formal' | 'friendly' | 'concise'>('friendly');
  let intent = $state<
    'interested-want-more' | 'interested-with-concern' | 'polite-decline' | 'comp-first'
  >('interested-want-more');
  let userConcern = $state('');
  let userQuestion = $state('');

  const html = $derived(data.draftContent ? renderMarkdown(data.draftContent) : '');

  async function draftReply() {
    busy = 'draft';
    try {
      const res = await api.post<{
        ok: boolean;
        replyPath?: string;
        skipped?: string;
        message?: string;
        error?: string;
      }>(
        '/api/inbound/leads/' + data.lead.id + '/reply',
        { tone, intent, userConcern, userQuestion },
        { silent: true },
      );
      if (res.ok && res.replyPath) {
        toast.success('Reply drafted');
        await invalidateAll();
      } else if (res.skipped) {
        toast.info('Skipped: lead is ' + res.skipped);
      } else if (res.error) {
        toast.error(res.error);
      }
    } finally {
      busy = null;
    }
  }

  async function markSent() {
    busy = 'sent';
    try {
      const res = await api.post<{ ok: boolean }>(
        '/api/inbound/leads/' + data.lead.id,
        { markSent: true },
        { silent: true },
      );
      if (res.ok) {
        toast.success('Marked as sent');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  async function close() {
    busy = 'close';
    try {
      const res = await api.post<{ ok: boolean }>(
        '/api/inbound/leads/' + data.lead.id,
        { state: 'closed' },
        { silent: true },
      );
      if (res.ok) {
        toast.success('Thread closed');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  function copyDraft() {
    if (!data.draftContent || typeof navigator === 'undefined') return;
    // Extract just the body between the Hi/Best lines if possible
    const m = /Hi\s[^\n]+,([\s\S]+?)Best,/i.exec(data.draftContent);
    const text = m
      ? (
          'Hi ' +
          m[0].split(/[,\n]/, 1)[0].replace(/^Hi\s+/i, '') +
          ',\n' +
          m[1].trim() +
          '\n\nBest,'
        ).trim()
      : data.draftContent;
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }
</script>

<svelte:head>
  <title>{docTitle([data.lead.senderName || 'Lead', 'Inbound'])}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6 p-6">
  <header>
    <a href="/inbound" class="text-xs text-zinc-400 hover:text-zinc-200">← All inbound</a>
    <h1 class="mt-2 text-2xl font-semibold">{data.lead.senderName || '(unknown sender)'}</h1>
    <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline">{data.lead.channel}</Badge>
      <Badge variant="outline">{data.lead.kind}</Badge>
      {#if data.thread?.state}
        <Badge variant="outline">{data.thread.state}</Badge>
      {/if}
      <span class="text-xs text-zinc-500">{new Date(data.lead.arrivedAt).toLocaleString()}</span>
      {#if data.lead.senderProfileUrl}
        <a
          href={data.lead.senderProfileUrl}
          target="_blank"
          rel="noopener"
          class="text-xs text-cyan-400 hover:underline">LinkedIn profile</a
        >
      {/if}
    </div>
  </header>

  <!-- Original message -->
  <section class="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
    <h2 class="text-xs uppercase tracking-wider text-zinc-400">Original message</h2>
    {#if data.lead.subject}
      <p class="mt-2 text-sm font-medium">{data.lead.subject}</p>
    {/if}
    <pre class="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">{data.lead.body}</pre>
  </section>

  <!-- Draft controls / preview -->
  <section class="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
    <h2 class="text-xs uppercase tracking-wider text-zinc-400">Reply draft (never auto-sent)</h2>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <label class="text-xs">
        <span class="text-zinc-400">Tone</span>
        <select
          bind:value={tone}
          class="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 w-full mt-1"
        >
          <option value="friendly">friendly</option>
          <option value="formal">formal</option>
          <option value="concise">concise</option>
        </select>
      </label>
      <label class="text-xs">
        <span class="text-zinc-400">Intent</span>
        <select
          bind:value={intent}
          class="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 w-full mt-1"
        >
          <option value="interested-want-more">Interested · want more info</option>
          <option value="interested-with-concern">Interested · have a concern</option>
          <option value="polite-decline">Polite decline</option>
          <option value="comp-first">Comp-first filter</option>
        </select>
      </label>
      <label class="col-span-2 text-xs">
        <span class="text-zinc-400">Concern to address (optional)</span>
        <input
          bind:value={userConcern}
          class="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        />
      </label>
      <label class="col-span-2 text-xs">
        <span class="text-zinc-400">Question to weave in (optional)</span>
        <input
          bind:value={userQuestion}
          class="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        />
      </label>
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button onclick={draftReply} disabled={busy !== null}>
        {busy === 'draft' ? 'Drafting...' : data.draftContent ? 'Re-draft' : 'Generate draft'}
      </Button>
      {#if data.draftContent}
        <Button variant="outline" onclick={copyDraft}>
          {#if copied}<Check class="mr-1 size-3.5" />Copied
          {:else}<Copy class="mr-1 size-3.5" />Copy body
          {/if}
        </Button>
        <Button variant="outline" onclick={markSent} disabled={busy !== null}>
          <Send class="mr-1 size-3.5" /> I sent this
        </Button>
      {/if}
      <Button variant="ghost" onclick={close} disabled={busy !== null}>
        <Archive class="mr-1 size-3.5" /> Close thread
      </Button>
    </div>

    {#if data.draftContent}
      <article
        class="prose prose-invert prose-sm mt-4 max-w-none rounded border border-zinc-800 bg-zinc-950/50 p-4"
      >
        {@html html}
      </article>
    {:else}
      <p class="mt-3 text-xs text-zinc-500">
        No draft yet — pick tone + intent and click Generate.
      </p>
    {/if}
  </section>
</div>
