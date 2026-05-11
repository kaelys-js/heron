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
  import KeywordMatchBadge from '$lib/components/KeywordMatchBadge.svelte';
  import CompPreflightBadge from '$lib/components/CompPreflightBadge.svelte';
  import ApplyTimingBadge from '$lib/components/ApplyTimingBadge.svelte';
  import PdfPreviewPanel from '$lib/components/PdfPreviewPanel.svelte';
  import {
    Send, MessageSquare, DollarSign, Briefcase, ScrollText,
    ChevronDown, FileText, Network as Linkedin, Loader2, Copy, ExternalLink,
    Mail, RefreshCw,
  } from '@lucide/svelte';
  import { invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import type { Job } from '$lib/types';
  import type { ReportSummary as ReportSummaryT } from '$lib/server/report-summary';
  import { cmd } from '$lib/config/branding';

  let { data }: { data: { job: Job; report: string; summary: ReportSummaryT | null; profileId: string } } = $props();
  let html = $derived(data.report ? marked.parse(data.report) : '');
  // Every per-job endpoint takes ?profile so it reads from the right
  // profile's interview-prep / output / reports dirs and swaps symlinks
  // before spawning Claude. Append this query to every /api/job/... call.
  let pq = $derived('?profile=' + encodeURIComponent(data.profileId));
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


  let prepLoaded = $state(false);

  /** Try the persisted file first; only spawn a fresh generation if missing. */
  async function ensurePrepLoaded() {
    if (prepLoaded || !data.job?.id) return;
    prepLoaded = true;
    try {
      const r = await api.get<{ exists: boolean; content?: string }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/interview-prep' + pq,
        { silent: true },
      );
      if (r.exists && r.content) prepContent = r.content;
    } catch {
      // 404 or no report yet — leave empty so the user can hit Generate
    }
  }

  async function loadPrep() {
    if (!data.job?.reportFile || !data.job?.id) return;
    prepLoading = true;
    prepError = null;
    try {
      const r = await api.post<{ ok: boolean; content?: string; error?: string }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/interview-prep' + pq,
        {},
        { silent: true },
      );
      if (r.ok && r.content) {
        prepContent = r.content;
      } else {
        prepError = r.error ?? 'Generation failed';
      }
    } catch (e) {
      prepError = (e as ApiError).message ?? 'Network error';
    } finally {
      prepLoading = false;
    }
  }

  async function startMock() {
    if (!data.job?.reportFile) return;
    chatHistory = [];
    chatLoading = true;
    try {
      // api.post auto-toasts network errors; keep `silent: true` here
      // because the chat UI itself surfaces the error inline below.
      // Pass ?profile so the report + CV are read from the right profile
      // (the job page's loader resolves it and exposes data.profileId).
      const r = await api.post<{ reply: string }>(
        '/api/mock-interview?profile=' + encodeURIComponent(data.profileId),
        { reportFile: data.job.reportFile, history: [], persona: chatPersona },
        { silent: true },
      );
      chatHistory = [{ role: 'assistant', content: r.reply }];
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message ?? 'Network error';
      chatHistory = [{ role: 'assistant', content: '⚠️ ' + msg }];
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
      const r = await api.post<{ reply: string }>(
        '/api/mock-interview?profile=' + encodeURIComponent(data.profileId),
        { reportFile: data.job.reportFile, history: newHistory, persona: chatPersona },
        { silent: true },
      );
      chatHistory = [...newHistory, { role: 'assistant', content: r.reply }];
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message ?? 'Network error';
      chatHistory = [...newHistory, { role: 'assistant', content: '⚠️ ' + msg }];
    } finally {
      chatLoading = false;
    }
  }

  async function getNegotiation() {
    if (!data.job?.reportFile || !offerInput.trim()) return;
    negotiationLoading = true;
    negotiationError = null;
    try {
      // Pass ?profile so /api/negotiation reads the right profile's report.
      const r = await api.post<{ content: string }>(
        '/api/negotiation?profile=' + encodeURIComponent(data.profileId),
        { reportFile: data.job.reportFile, offer: offerInput },
        { inlineError: true },
      );
      negotiationContent = r.content;
    } catch (e) {
      negotiationError = e instanceof ApiError
        ? (e.message ?? 'Generation failed')
        : (e as Error).message ?? 'Network error';
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

  // ---- Outreach tab state ----
  // Three personas, each independently spawnable + persisted. The cached
  // endpoint primes the UI with anything previously generated so a reload
  // doesn't lose work.
  type Persona = 'hiring-manager' | 'recruiter' | 'peer';
  let outreachPersona = $state<Persona>('hiring-manager');
  let outreachByPersona = $state<Record<Persona, string>>({
    'hiring-manager': '',
    recruiter: '',
    peer: '',
  });
  let outreachBusy = $state(false);
  let outreachLoaded = $state(false);

  async function loadCachedOutreach() {
    if (outreachLoaded || !data.job?.id) return;
    outreachLoaded = true;
    try {
      const r = await api.get<{ variants: { persona: Persona; content: string }[] }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/outreach/cached' + pq,
        { silent: true },
      );
      const next = { ...outreachByPersona };
      for (const v of r.variants) next[v.persona] = v.content;
      outreachByPersona = next;
    } catch {
      // 404 / parse failure → just leave empty; user clicks Generate to populate
    }
  }

  async function generateOutreach() {
    if (!data.job?.id || outreachBusy) return;
    outreachBusy = true;
    try {
      const r = await api.post<{ ok: boolean; persona: Persona; path: string; content: string; error?: string }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/outreach' + pq,
        { persona: outreachPersona },
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Outreach generation failed');
      outreachByPersona = { ...outreachByPersona, [outreachPersona]: r.content };
      toast.success('Outreach drafted', {
        description: '3 variants ready · pick a tone and copy into LinkedIn / email.',
        duration: 6_000,
      });
    } catch (e) {
      const err = e as ApiError;
      toast.error('Outreach failed', {
        description: err.message + ' — Claude Code CLI must be on PATH.',
        action: { label: 'Retry', onClick: () => generateOutreach() },
        duration: 12_000,
      });
    } finally {
      outreachBusy = false;
    }
  }

  async function copyOutreach() {
    const content = outreachByPersona[outreachPersona];
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Outreach copied');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  // Lazy-load cached drafts the first time the user opens the Outreach tab.
  $effect(() => {
    if (activeTab === 'outreach') {
      void loadCachedOutreach();
    }
  });

  // Same lazy-load pattern for the Interview Prep tab — pulls the persisted
  // brief if one exists (auto-fired by the bus listener on status→Interview).
  $effect(() => {
    if (activeTab === 'prep') {
      void ensurePrepLoaded();
    }
  });

  let outreachContent = $derived(outreachByPersona[outreachPersona]);
  let outreachHtml = $derived(outreachContent ? marked.parse(outreachContent) : '');

  // ---- Cover letter tab state ----
  // One letter per job, persisted next to the tailored CV PDF in output/.
  // Lazy-loads on first tab open; "Regenerate" overwrites the file.
  let coverContent = $state('');
  let coverPath = $state('');
  let coverBusy = $state(false);
  let coverLoaded = $state(false);
  let coverError = $state<string | null>(null);

  async function loadCachedCover() {
    if (coverLoaded || !data.job?.id) return;
    coverLoaded = true;
    try {
      const r = await api.get<{ cached: { path: string; body: string } | null }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/cover-letter' + pq,
        { silent: true },
      );
      if (r.cached) {
        coverContent = r.cached.body;
        coverPath = r.cached.path;
      }
    } catch {
      // 404 → leave empty; user clicks Generate
    }
  }

  async function generateCover() {
    if (!data.job?.id || coverBusy) return;
    coverBusy = true;
    coverError = null;
    try {
      const r = await api.post<{ ok: boolean; path?: string; body?: string; error?: string }>(
        '/api/job/' + encodeURIComponent(data.job.id) + '/cover-letter' + pq,
        {},
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Cover letter generation failed');
      coverContent = r.body ?? '';
      coverPath = r.path ?? '';
      toast.success('Cover letter ready', {
        description: 'Saved to ' + (r.path ?? 'output/'),
        duration: 6_000,
      });
    } catch (e) {
      const err = e as ApiError;
      coverError = err.message;
      toast.error('Cover letter failed', {
        description: err.message + ' — Claude Code CLI must be on PATH.',
        action: { label: 'Retry', onClick: () => generateCover() },
        duration: 12_000,
      });
    } finally {
      coverBusy = false;
    }
  }

  async function copyCover() {
    if (!coverContent) return;
    try {
      await navigator.clipboard.writeText(coverContent);
      toast.success('Cover letter copied');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  $effect(() => {
    if (activeTab === 'cover-letter') {
      void loadCachedCover();
    }
  });

  let coverHtml = $derived(coverContent ? marked.parse(coverContent) : '');

  let linkedInSearchUrl = $derived(
    'https://www.linkedin.com/search/results/people/?keywords=' +
      encodeURIComponent(
        (data.job?.company ? data.job.company + ' ' : '') +
        (outreachPersona === 'hiring-manager' ? 'engineering manager' :
         outreachPersona === 'recruiter' ? 'recruiter' :
         (data.job?.role ?? '')),
      ),
  );
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
                <!--
                  Badges row — surfaces high-signal context inline near
                  the title rather than buried in tabs. ATS-match badge
                  hidden until a deep-eval report exists; comp-preflight
                  hidden until the job is in an interview stage.
                -->
                <div class="mt-2 flex items-center gap-2 flex-wrap">
                  <ApplyTimingBadge jobId={data.job.id} profileId={data.profileId} status={data.job.status} />
                  <KeywordMatchBadge jobId={data.job.id} profileId={data.profileId} />
                  <CompPreflightBadge jobId={data.job.id} status={data.job.status} />
                </div>
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

          <!--
            Tailored CV preview — renders inline via /api/job/[id]/pdf when a
            PDF has been generated. Collapsed by default so the user opts in.
          -->
          {#if data.job.pdfFile}
            <PdfPreviewPanel jobId={data.job.id} pdfFile={data.job.pdfFile} profileId={data.profileId} defaultOpen={false} />
          {/if}

          <Tabs.Root value={activeTab} onValueChange={(v: string) => (activeTab = v)} class="w-full">
            <!--
              Six tabs at text-xs + icon overflow on narrow viewports. We wrap
              Tabs.List in a horizontally-scrollable shell so the whole strip
              stays on a single row and the active tab can be scrolled into
              view. Scrollbar is hidden visually but trackpad swipes work.
            -->
            <div class="mb-4 -mx-1 px-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              <Tabs.List class="bg-transparent border h-9 p-0.5 inline-flex">
                <Tabs.Trigger value="overview" class="text-xs h-8 px-3 whitespace-nowrap">
                  <ScrollText class="size-3.5 mr-1.5" /> Report
                </Tabs.Trigger>
                <Tabs.Trigger value="prep" class="text-xs h-8 px-3 whitespace-nowrap" disabled={!data.job.reportFile}>
                  <Briefcase class="size-3.5 mr-1.5" /> Interview prep
                </Tabs.Trigger>
                <Tabs.Trigger value="mock" class="text-xs h-8 px-3 whitespace-nowrap" disabled={!data.job.reportFile}>
                  <MessageSquare class="size-3.5 mr-1.5" /> Mock interview
                </Tabs.Trigger>
                <Tabs.Trigger value="negotiation" class="text-xs h-8 px-3 whitespace-nowrap" disabled={!data.job.reportFile}>
                  <DollarSign class="size-3.5 mr-1.5" /> Negotiation
                </Tabs.Trigger>
                <Tabs.Trigger value="outreach" class="text-xs h-8 px-3 whitespace-nowrap">
                  <Linkedin class="size-3.5 mr-1.5" /> Outreach
                </Tabs.Trigger>
                <Tabs.Trigger value="cover-letter" class="text-xs h-8 px-3 whitespace-nowrap">
                  <Mail class="size-3.5 mr-1.5" /> Cover letter
                </Tabs.Trigger>
              </Tabs.List>
            </div>

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
                <div class="space-y-3">
                  <Button onclick={loadPrep} disabled={prepLoading || !data.job.reportFile} class="gap-1.5">
                    {#if prepLoading}<Loader2 class="size-3.5 animate-spin" /> Generating…{:else}<Briefcase class="size-3.5" /> Generate Interview Prep Brief{/if}
                  </Button>
                  <p class="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                    Produces 8–12 likely questions, a STAR map mapping your proof points to expected behaviorals,
                    a 5-topic study plan, 3 strong talking points, red flags to watch for, and 5 questions to ask back.
                    Auto-fires when this job's status flips to <span class="font-mono">Interview</span> — so by the time
                    you have an interview scheduled, the brief is already waiting.
                  </p>
                </div>
              {:else}
                <div class="space-y-4">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] uppercase tracking-wider text-muted-foreground flex-1">Persisted at <code class="font-mono">interview-prep/{data.job.id}.md</code></span>
                    <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5" onclick={() => (activeTab = 'mock')}>
                      <MessageSquare class="size-3" /> Practice with this
                    </Button>
                    <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5" onclick={loadPrep} disabled={prepLoading}>
                      {#if prepLoading}<Loader2 class="size-3 animate-spin" /> Regenerating…{:else}<Briefcase class="size-3" /> Regenerate{/if}
                    </Button>
                  </div>
                  <article class="prose prose-invert prose-sm max-w-none">
                    {@html prepHtml}
                  </article>
                </div>
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

            <!--
              Outreach — generates cold-message drafts to a chosen persona.
              Three personas, each independently spawnable; we lazy-load any
              previously persisted drafts when the tab is first opened so
              regeneration is opt-in.
            -->
            <Tabs.Content value="outreach">
              <div class="space-y-4">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Persona</span>
                  <Button
                    variant={outreachPersona === 'hiring-manager' ? 'default' : 'outline'}
                    size="sm"
                    class="h-7 text-xs"
                    onclick={() => (outreachPersona = 'hiring-manager')}
                    disabled={outreachBusy}
                  >Hiring manager</Button>
                  <Button
                    variant={outreachPersona === 'recruiter' ? 'default' : 'outline'}
                    size="sm"
                    class="h-7 text-xs"
                    onclick={() => (outreachPersona = 'recruiter')}
                    disabled={outreachBusy}
                  >Recruiter</Button>
                  <Button
                    variant={outreachPersona === 'peer' ? 'default' : 'outline'}
                    size="sm"
                    class="h-7 text-xs"
                    onclick={() => (outreachPersona = 'peer')}
                    disabled={outreachBusy}
                  >Peer at the company</Button>
                  <div class="flex-1"></div>
                  {#if outreachContent}
                    <Button variant="ghost" size="sm" class="h-7 text-xs gap-1.5" onclick={copyOutreach}>
                      <Copy class="size-3" /> Copy
                    </Button>
                  {/if}
                  <Button
                    size="sm"
                    class="h-7 text-xs gap-1.5"
                    onclick={generateOutreach}
                    disabled={outreachBusy}
                  >
                    {#if outreachBusy}
                      <Loader2 class="size-3 animate-spin" /> Drafting…
                    {:else if outreachContent}
                      <Linkedin class="size-3" /> Regenerate
                    {:else}
                      <Linkedin class="size-3" /> Generate
                    {/if}
                  </Button>
                </div>

                <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
                  Generates short LinkedIn messages tuned for {outreachPersona === 'hiring-manager' ? 'an engineering manager or other decision-maker' : outreachPersona === 'recruiter' ? 'an in-house recruiter or sourcer' : 'a current employee on the team (a peer, not someone with hiring power)'}.
                  Each variant pulls one specific proof point from your CV and references something concrete from the job's evaluation report — so it doesn't read like the generic "I'm interested in your role" template everyone else sends.
                </p>

                {#if outreachContent}
                  <article class="prose prose-invert prose-sm max-w-none">
                    {@html outreachHtml}
                  </article>
                  <div class="flex items-center gap-2 pt-2 border-t border-border/40">
                    <span class="text-[10px] text-muted-foreground/70">Find someone to message:</span>
                    <a
                      href={linkedInSearchUrl}
                      target="_blank"
                      rel="noopener"
                      class="inline-flex items-center gap-1 text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                    >
                      Search LinkedIn for {outreachPersona === 'hiring-manager' ? 'managers' : outreachPersona === 'recruiter' ? 'recruiters' : 'team members'} at {data.job.company}
                      <ExternalLink class="size-2.5" />
                    </a>
                  </div>
                {:else}
                  <EmptyState
                    size="md"
                    variant="card"
                    icon={Linkedin}
                    title="No outreach drafted yet"
                    description={'Click Generate to draft messages for the ' + (outreachPersona === 'hiring-manager' ? 'hiring-manager' : outreachPersona) + ' angle. Runs ' + cmd('contacto') + ' in the background — usually 30–60s. The result is saved to interview-prep/ so a reload restores it.'}
                  />
                {/if}
              </div>
            </Tabs.Content>

            <Tabs.Content value="cover-letter">
              <div class="space-y-3 max-w-full overflow-hidden">
                <!-- Header row: title + action buttons -->
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="space-y-1 max-w-2xl">
                    <h3 class="text-sm font-semibold flex items-center gap-1.5">
                      <Mail class="size-4 text-amber-400" /> Cover letter
                    </h3>
                    <p class="text-[11px] text-muted-foreground leading-relaxed">
                      A one-page letter in your own voice, written specifically for this job. Two of your
                      strongest CV proof points are matched to the most important requirements in the JD,
                      then tied to a public detail about the company. The output is plain markdown — copy
                      it into the application form, an email, or a Word doc.
                    </p>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    {#if coverContent}
                      <Button variant="ghost" size="sm" class="h-8 gap-1.5" onclick={copyCover}>
                        <Copy class="size-3" /> Copy
                      </Button>
                    {/if}
                    <Button size="sm" class="h-8 gap-1.5" onclick={generateCover} disabled={coverBusy}>
                      {#if coverBusy}
                        <Loader2 class="size-3 animate-spin" /> Drafting…
                      {:else if coverContent}
                        <RefreshCw class="size-3" /> Regenerate
                      {:else}
                        <Mail class="size-3" /> Generate
                      {/if}
                    </Button>
                  </div>
                </div>

                <!-- Inline guidance for what to do next -->
                {#if coverContent}
                  <div class="rounded-md border border-border/40 bg-muted/20 px-3 py-2 flex items-start gap-2">
                    <Mail class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p class="text-[11px] text-muted-foreground/90 leading-relaxed">
                      Saved to
                      <code class="font-mono text-[10px] bg-background/60 px-1 py-0.5 rounded break-all">output/{coverPath ? coverPath.split('/').pop() : ''}</code>.
                      Read it once before you send — if a sentence sounds off, click Regenerate (each run is fresh,
                      not a refinement). Replace any <code class="font-mono text-[10px]">_TODO_</code> placeholders
                      from your profile.yml gaps before submitting.
                    </p>
                  </div>
                {/if}

                {#if coverError && !coverContent}
                  <ErrorState
                    title="Cover letter generation failed"
                    description={coverError}
                    onretry={generateCover}
                  />
                {:else if coverContent}
                  <!-- max-w-full + overflow-hidden + prose-pre wrap to prevent the markdown
                       article from expanding the tab content past the card width -->
                  <article class="prose prose-invert prose-sm max-w-full overflow-hidden rounded-md border border-border/40 bg-card px-4 py-3 prose-headings:font-semibold prose-pre:bg-muted prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-strong:text-foreground prose-a:break-all">
                    {@html coverHtml}
                  </article>
                {:else if coverLoaded && !coverBusy}
                  <div class="space-y-3">
                    <EmptyState
                      size="md"
                      variant="card"
                      icon={Mail}
                      title="No cover letter generated yet"
                      description={'Click Generate to draft one. The mode reads cv.md plus this job\'s evaluation report (so it has the same context the CV PDF was tailored against). First run takes 30–60s; later runs hit the on-disk copy instantly.'}
                    />
                    <!-- What you'll get + what you have to do -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div class="rounded-md border border-border/40 bg-card px-3 py-2.5 space-y-1">
                        <h4 class="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">What you get</h4>
                        <ul class="text-[11px] text-muted-foreground/90 leading-relaxed list-disc pl-4 space-y-0.5">
                          <li>Single page, ≤ 350 words</li>
                          <li>Your two strongest CV proof points (with numbers, not invented ones)</li>
                          <li>One reference to the company you'd actually plausibly know</li>
                          <li>An honest framing of the riskiest gap, not a hedge</li>
                          <li>Plain markdown — easy to paste anywhere</li>
                        </ul>
                      </div>
                      <div class="rounded-md border border-border/40 bg-card px-3 py-2.5 space-y-1">
                        <h4 class="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">What's still on you</h4>
                        <ul class="text-[11px] text-muted-foreground/90 leading-relaxed list-disc pl-4 space-y-0.5">
                          <li>Reading it. Don't send something Claude wrote without scanning it first.</li>
                          <li>Picking the medium (paste into the portal, an email, or a Word doc)</li>
                          <li>Submitting — this never sends anything for you</li>
                          <li>Filling any <code class="font-mono">_TODO_</code> markers if profile.yml is incomplete</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                {:else if !coverLoaded}
                  <!-- First render before the cached lookup completes -->
                  <div class="flex items-center gap-2 text-xs text-muted-foreground py-6">
                    <Loader2 class="size-3.5 animate-spin" />
                    Looking for an existing cover letter…
                  </div>
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
