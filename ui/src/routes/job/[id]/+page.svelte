<script lang="ts">
  import { marked } from 'marked';
  import Topbar from '$lib/components/Topbar.svelte';
  import PropertiesPane from '$lib/components/PropertiesPane.svelte';
  import ReportSummary from '$lib/components/ReportSummary.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Separator } from '$lib/components/ui/separator';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import JobActions from '$lib/components/JobActions.svelte';
  import {
    Send, MessageSquare, DollarSign, Briefcase, ScrollText,
    ChevronDown, FileText,
  } from '@lucide/svelte';
  import { invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import type { Job } from '$lib/types';
  import type { ReportSummary as ReportSummaryT } from '$lib/server/report-summary';
  import { cmd } from '$lib/config/branding';

  let { data }: { data: { job: Job; report: string; summary: ReportSummaryT | null } } = $props();
  let html = $derived(data.report ? marked.parse(data.report) : '');
  let activeTab = $state('overview');

  let prepLoading = $state(false);
  let prepContent = $state('');
  let prepError = $state<string | null>(null);
  let prepHtml = $derived(prepContent ? marked.parse(prepContent) : '');

  let chatHistory = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
  let chatInput = $state('');
  let chatLoading = $state(false);
  let chatPersona = $state('Hiring Manager');

  let offerInput = $state('');
  let negotiationContent = $state('');
  let negotiationError = $state<string | null>(null);
  let negotiationHtml = $derived(negotiationContent ? marked.parse(negotiationContent) : '');
  let negotiationLoading = $state(false);


  async function loadPrep() {
    if (!data.job?.reportFile) return;
    prepLoading = true;
    prepError = null;
    try {
      const r = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile }),
      });
      const j = await r.json();
      if (j.ok) {
        prepContent = j.content;
      } else {
        prepError = j.error?.message ?? j.error ?? 'Generation failed';
      }
    } catch (e) {
      prepError = (e as Error).message ?? 'Network error';
    } finally {
      prepLoading = false;
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
      chatHistory = [...newHistory, { role: 'assistant', content: j.ok ? j.reply : '⚠️ ' + (j.error || 'error') }];
    } finally {
      chatLoading = false;
    }
  }

  async function getNegotiation() {
    if (!data.job?.reportFile || !offerInput.trim()) return;
    negotiationLoading = true;
    negotiationError = null;
    try {
      const r = await fetch('/api/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, offer: offerInput }),
      });
      const j = await r.json();
      if (j.ok) {
        negotiationContent = j.content;
      } else {
        negotiationError = j.error?.message ?? j.error ?? 'Generation failed';
      }
    } catch (e) {
      negotiationError = (e as Error).message ?? 'Network error';
    } finally {
      negotiationLoading = false;
    }
  }

  // Status / Apply / Generate CV are all handled inside <JobActions /> now.
  // PropertiesPane keeps its own status dropdown for the right-rail UX, so we
  // still expose a thin updateStatus wrapper here for that callback.
  async function updateStatus(newStatus: string) {
    if (!data.job?.url) return;
    try {
      await api.post('/api/status', { url: data.job.url, newStatus }, { silent: true });
      toast.success('Status → ' + newStatus);
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Status update failed', { description: err.message });
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title={data.job?.role ?? 'Job'} subtitle={data.job?.company} breadcrumb="Pipeline" breadcrumbHref="/pipeline" showTabs={false} />
  <div class="flex">
    <main class="flex-1 min-w-0">
      <div class="max-w-3xl mx-auto px-8 py-6 space-y-6">
        {#if data.job}
          <!-- Header: title + company + action row -->
          <header class="space-y-2">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="min-w-0">
                <h1 class="text-2xl font-semibold tracking-tight leading-tight">{data.job.role}</h1>
                <p class="text-muted-foreground mt-1 text-sm">{data.job.company} · {data.job.location || '—'}</p>
              </div>

              <!--
                Action row uses the SHARED JobActions component — same logic
                everywhere (board card, list row, compact, table, by-company,
                and here). Single source of truth for apply/status/CV.
              -->
              <JobActions job={data.job} size="hero" align="end" />
            </div>
          </header>

          <!-- Key facts panel above the tabs -->
          {#if data.summary}
            <ReportSummary summary={data.summary} />
          {/if}

          <Tabs.Root value={activeTab} onValueChange={(v: string) => (activeTab = v)} class="w-full">
            <Tabs.List class="bg-transparent border h-9 p-0.5 mb-4">
              <Tabs.Trigger value="overview" class="text-xs h-8 px-3">
                <ScrollText class="size-3.5 mr-1.5" /> Report
              </Tabs.Trigger>
              <Tabs.Trigger value="prep" class="text-xs h-8 px-3" disabled={!data.job.reportFile}>
                <Briefcase class="size-3.5 mr-1.5" /> Interview Prep
              </Tabs.Trigger>
              <Tabs.Trigger value="mock" class="text-xs h-8 px-3" disabled={!data.job.reportFile}>
                <MessageSquare class="size-3.5 mr-1.5" /> Mock Interview
              </Tabs.Trigger>
              <Tabs.Trigger value="negotiation" class="text-xs h-8 px-3" disabled={!data.job.reportFile}>
                <DollarSign class="size-3.5 mr-1.5" /> Negotiation
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="overview">
              {#if data.report}
                <details class="group" open={!data.summary}>
                  <summary class="text-[11px] uppercase tracking-wider text-muted-foreground/70 cursor-pointer hover:text-foreground select-none mb-3 flex items-center gap-1.5 list-none">
                    <ChevronDown class="size-3.5 transition-transform group-open:rotate-0 -rotate-90" />
                    <FileText class="size-3" />
                    Full evaluation report
                    <span class="text-muted-foreground/50">· {data.report.length.toLocaleString()} chars</span>
                  </summary>
                  <article class="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-pre:bg-muted prose-table:text-sm prose-th:font-semibold prose-strong:text-foreground prose-a:text-foreground prose-a:underline prose-a:underline-offset-2">
                    {@html html}
                  </article>
                </details>
              {:else}
                <EmptyState
                  size="md"
                  variant="card"
                  icon={ScrollText}
                  title="No deep evaluation yet"
                  description={'Run ' + cmd('oferta') + ' with this job’s URL in Claude Code to generate a tailored A–G report. Or use the Generate CV action above.'}
                />
              {/if}
            </Tabs.Content>

            <Tabs.Content value="prep">
              {#if prepError}
                <ErrorState
                  size="md"
                  title="Couldn't generate prep brief"
                  error={prepError}
                  onretry={loadPrep}
                />
              {:else if !prepContent}
                <Button onclick={loadPrep} disabled={prepLoading || !data.job.reportFile}>
                  {prepLoading ? 'Generating…' : 'Generate Interview Prep Brief'}
                </Button>
                <p class="text-xs text-muted-foreground mt-2">
                  Likely 8–12 questions, STAR map, study plan, talking points, red flags, and questions to ask back.
                </p>
              {:else}
                <article class="prose prose-invert prose-sm max-w-none">
                  {@html prepHtml}
                </article>
              {/if}
            </Tabs.Content>

            <Tabs.Content value="mock">
              <div class="flex items-center gap-2 mb-3">
                <select bind:value={chatPersona} class="text-xs h-8 px-2 rounded border bg-background">
                  <option>Recruiter Screen</option>
                  <option>Hiring Manager</option>
                  <option>Tech Lead / Peer</option>
                  <option>Cross-functional</option>
                </select>
                <Button size="sm" onclick={startMock} disabled={chatLoading}>
                  {chatHistory.length === 0 ? 'Start Mock' : 'Restart'}
                </Button>
              </div>
              <div class="border rounded-lg bg-muted/20 p-4 max-h-[500px] overflow-y-auto space-y-4">
                {#each chatHistory as turn}
                  <div class={turn.role === 'user' ? '' : 'border-l-2 border-primary/30 pl-3'}>
                    <div class="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      {turn.role === 'user' ? 'You' : 'Interviewer'}
                    </div>
                    <p class="text-sm whitespace-pre-wrap leading-relaxed">{turn.content}</p>
                  </div>
                {/each}
                {#if chatHistory.length === 0}
                  <p class="text-sm text-muted-foreground italic">Click Start Mock — interviewer will open with a question.</p>
                {/if}
                {#if chatLoading}
                  <p class="text-xs text-muted-foreground italic">interviewer is thinking…</p>
                {/if}
              </div>
              <form onsubmit={(e) => { e.preventDefault(); sendChat(); }} class="flex gap-2 mt-3">
                <Textarea bind:value={chatInput} placeholder="Your answer…" rows={2} disabled={chatLoading || chatHistory.length === 0} />
                <Tooltip.Provider delayDuration={250}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button {...props} type="submit" disabled={chatLoading || !chatInput.trim() || chatHistory.length === 0} aria-label="Send answer">
                          <Send class="size-3.5" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="top" class="text-xs">Send answer</Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </form>
            </Tabs.Content>

            <Tabs.Content value="negotiation">
              <div class="space-y-3">
                <p class="text-sm text-muted-foreground">Paste offer details (base / equity / bonus / location / start date / competing offers):</p>
                <Textarea bind:value={offerInput} rows={6} placeholder="Base: $X / Equity: ... / etc." class="font-mono text-sm" />
                <Button onclick={getNegotiation} disabled={negotiationLoading || !offerInput.trim()}>
                  {negotiationLoading ? 'Generating…' : 'Generate Negotiation Brief'}
                </Button>
                {#if negotiationError}
                  <ErrorState
                    size="md"
                    title="Couldn't generate negotiation brief"
                    error={negotiationError}
                    onretry={getNegotiation}
                  />
                {:else if negotiationContent}
                  <Separator />
                  <article class="prose prose-invert prose-sm max-w-none">
                    {@html negotiationHtml}
                  </article>
                {/if}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        {:else}
          <div class="text-muted-foreground">Job not found.</div>
        {/if}
      </div>
    </main>
    {#if data.job}
      <PropertiesPane job={data.job} onStatusChange={updateStatus} />
    {/if}
  </div>
</div>
