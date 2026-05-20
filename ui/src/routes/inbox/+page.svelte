<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import JobCard from '$lib/components/JobCard.svelte';
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import BulkActions from '$lib/components/BulkActions.svelte';
  import {
    Inbox as InboxIcon,
    Sparkles,
    Send,
    Search,
    Plus,
    ArrowRight,
    RefreshCw,
    AlertCircle,
    AlertTriangle,
    Info,
    CheckCircle2,
    Clock,
    Zap,
    TrendingUp,
    TrendingDown,
    Flame,
    Activity as ActivityIcon,
    Briefcase,
    Target,
    ListTodo,
    FileText,
    KanbanSquare,
    ChevronRight,
    Globe,
    Bell,
  } from '@lucide/svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';
  import { globalActions } from '$lib/global-actions.svelte';
  import type { ActivityEvent, EventLevel, Job, Status } from '$lib/types';

  type InboxAlert = {
    id: string;
    level: 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    actionLabel?: string;
    actionUrl?: string;
    actionTask?: 'scan' | 'gemini' | 'apply-linkedin';
    actionPostUrl?: string;
  };

  let {
    data,
  }: {
    data: {
      profileId: string;
      firstName: string;
      nowISO: string;
      upNext: Job[];
      upNextTotal: number;
      ready: Job[];
      readyTotal: number;
      inFlight: Job[];
      inFlightTotal: number;
      followUps: Job[];
      followUpsTotal: number;
      counts: { totalJobs: number; unscored: number; totalApps: number; activeCount: number };
      velocity: { day: string; count: number }[];
      last7: number;
      prev7: number;
      velocityDeltaPct: number | null;
      topSources: { name: string; count: number }[];
      activity: ActivityEvent[];
      recentErrorsCount: number;
      pipelineDaysAgo: number | null;
      alerts: InboxAlert[];
      applyIssues: Array<{
        id: string;
        severity: 'info' | 'warn' | 'error';
        summary: string;
        detail?: string;
        fix?: { label: string; href: string };
        jobId: string;
        source: string;
        ts: number;
      }>;
      inboundLeads: Array<{ sender: string; subject: string; ts: number }>;
      followupsUrgent: { job: Job; entry: import('$lib/server/followup-cadence').FollowupEntry }[];
      followupsOverdue: { job: Job; entry: import('$lib/server/followup-cadence').FollowupEntry }[];
      followupsCadenceMeta:
        | import('$lib/server/followup-cadence').FollowupCadence['metadata']
        | null;
      postApplyCards: Array<{
        id: string;
        kind:
          | 'thank-you-owed'
          | 'follow-up-due'
          | 'prep-block-recommended'
          | 'offer-decision-due'
          | 'ghosted-flagged'
          | 'next-action-due';
        jobId: string;
        title: string;
        description: string;
        dueAt: number;
        cta?: { label: string; href: string };
      }>;
      runtime: { hasAnthropic: boolean; hasGemini: boolean; runningTasks: string[] };
    };
  } = $props();

  let busyTask = $state<string | null>(null);

  async function runTask(task: 'scan' | 'gemini' | 'apply-linkedin', label: string) {
    if (busyTask) return;
    busyTask = task;
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean }>('/api/run', { task }, { silent: true }),
        500,
      );
      if (r.ok)
        toast.success(label + ' started', { description: 'Watch the activity feed for output.' });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to start ' + task, { description: err.message });
    } finally {
      busyTask = null;
    }
  }

  let postingAlert = $state<string | null>(null);

  async function postAlertAction(a: InboxAlert) {
    if (!a.actionPostUrl || postingAlert) return;
    postingAlert = a.id;
    try {
      await api.post(a.actionPostUrl, {}, { silent: true });
      toast.success(a.title.replace(/^Autopilot paused:?\s*/i, 'Autopilot resumed · '));
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Action failed', { description: err.message });
    } finally {
      postingAlert = null;
    }
  }

  function onAlertAction(a: InboxAlert) {
    if (a.actionTask) {
      runTask(a.actionTask, a.title);
    } else if (a.actionPostUrl) {
      postAlertAction(a);
    } else if (a.actionUrl) {
      goto(a.actionUrl);
    }
  }

  // ---- Apply-issue inline save-answer + re-queue ----
  // When an apply:{jobId} issue's detail starts with "unknown-field:label1,label2",
  // we parse out the missing question labels and let the user save an answer
  // inline -- POSTs to /api/profile/form-answers, then re-queues the job so
  // the drain picks it up again on next run.
  let expandedIssueId = $state<string | null>(null);
  let savingAnswer = $state(false);
  let requeueing = $state<string | null>(null);
  // Map of "issueId/label" → typed answer (so each row keeps its own state)
  let answerInputs = $state<Record<string, string>>({});

  /** Parse the unknown-field labels out of an issue.detail body.
   *  Format: "unknown-field:label1,label2,...\n\nPosting: <url>..." */
  function parseUnknownFields(detail?: string): string[] {
    if (!detail) return [];
    const firstLine = detail.split('\n')[0] ?? '';
    const m = /^unknown-field:(.+)$/.exec(firstLine.trim());
    if (!m) return [];
    return m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function saveAnswerForIssue(issueId: string, label: string) {
    const key = issueId + '/' + label;
    const answer = (answerInputs[key] ?? '').trim();
    if (!answer || savingAnswer) return;
    savingAnswer = true;
    try {
      await api.post('/api/profile/form-answers', { label, answer }, { silent: true });
      toast.success('Answer saved · ' + label.slice(0, 50), {
        description: 'Re-queue the job to apply again — the drain will use this answer next time.',
        duration: 7_000,
      });
      // Clear the input.
      answerInputs = { ...answerInputs, [key]: '' };
    } catch (e) {
      const err = e as ApiError;
      toast.error('Save failed', { description: err.message });
    } finally {
      savingAnswer = false;
    }
  }

  async function requeueJob(jobId: string) {
    if (requeueing) return;
    requeueing = jobId;
    try {
      // Re-queue endpoint: POST /api/job/[id]/queue-apply forces a new
      // Queued status. If the job is currently ManualApplyNeeded, that
      // change lets apply-queue-drain pick it back up.
      await api.post(
        '/api/job/' + encodeURIComponent(jobId) + '/queue-apply',
        {},
        { silent: true },
      );
      toast.success('Re-queued', {
        description: 'Drain will pick it up on next run (or "Run drain now" on /queue).',
      });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Re-queue failed', { description: err.message });
    } finally {
      requeueing = null;
    }
  }

  // ---- formatting helpers ----
  let weekday = $derived(new Date(data.nowISO).toLocaleDateString(undefined, { weekday: 'long' }));
  let dateStr = $derived(
    new Date(data.nowISO).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  );
  let velocityNumbers = $derived(data.velocity.map((v) => v.count));

  // Each tint is paired with a dark: variant so the pale-200 text the
  // dark-mode tile relies on doesn't render as invisible-on-white in
  // light mode (Lighthouse `color-contrast` previously caught this on
  // /login + /signup). The light-mode -700 shade hits WCAG AA against
  // the 5-10% bg tint these alerts use.
  let alertLevelTint: Record<string, string> = {
    error: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    info: 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-200',
  };
  function alertIcon(level: 'error' | 'warning' | 'info') {
    return level === 'error' ? AlertCircle : level === 'warning' ? AlertTriangle : Info;
  }

  function levelDot(level: EventLevel): string {
    return level === 'error'
      ? 'bg-red-500'
      : level === 'warn'
        ? 'bg-amber-500'
        : level === 'success'
          ? 'bg-emerald-500'
          : 'bg-blue-500';
  }

  let greeting = $derived.by(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Up late';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Burning the midnight oil';
  });
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Inbox" showTabs={false} showFilter={true} />

  <div class="p-6 pb-24">
    <div class="max-w-6xl mx-auto space-y-5">
      <!-- ===================== HERO ===================== -->
      <section class="space-y-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">
            {greeting}{data.firstName ? ', ' + data.firstName : ''}
          </h1>
          <p class="text-sm text-muted-foreground">
            {weekday}, {dateStr}
            {#if data.runtime.runningTasks.length > 0}
              · <span class="text-emerald-400 inline-flex items-center gap-1">
                <ActivityIcon class="size-3 animate-pulse" />
                {data.runtime.runningTasks.join(' + ')} running
              </span>
            {/if}
          </p>
        </div>

        <!-- Stat tiles + quick actions -->
        <Tooltip.Provider delayDuration={350}>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href="#up-next"
                    class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 hover:bg-emerald-500/10 transition-colors block"
                  >
                    <div class="flex items-center gap-1.5">
                      <Flame class="size-3.5 text-emerald-400" />
                      <span
                        class="text-[11px] uppercase tracking-wide text-emerald-800 dark:text-emerald-300/80 font-medium"
                        >Up next</span
                      >
                    </div>
                    <div
                      class="text-2xl font-mono tabular-nums mt-1 text-emerald-700 dark:text-emerald-200"
                    >
                      {data.upNextTotal}
                    </div>
                    <div class="text-[11px] text-muted-foreground">≥4.0 awaiting eval</div>
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Jump to high-fit jobs awaiting deep evaluation</Tooltip.Content
              >
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href="#in-flight"
                    class="rounded-lg border border-orange-500/30 bg-orange-500/5 px-4 py-3 hover:bg-orange-500/10 transition-colors block"
                  >
                    <div class="flex items-center gap-1.5">
                      <Target class="size-3.5 text-orange-400" />
                      <span
                        class="text-[11px] uppercase tracking-wide text-orange-800 dark:text-orange-300/80 font-medium"
                        >In flight</span
                      >
                    </div>
                    <div
                      class="text-2xl font-mono tabular-nums mt-1 text-orange-700 dark:text-orange-200"
                    >
                      {data.inFlightTotal}
                    </div>
                    <div class="text-[11px] text-muted-foreground">interview + offer</div>
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Active interviews and outstanding offers — your highest leverage</Tooltip.Content
              >
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href="#follow-ups"
                    class="rounded-lg border border-violet-500/30 bg-violet-500/5 px-4 py-3 hover:bg-violet-500/10 transition-colors block"
                  >
                    <div class="flex items-center gap-1.5">
                      <ListTodo class="size-3.5 text-violet-400" />
                      <span
                        class="text-[11px] uppercase tracking-wide text-violet-800 dark:text-violet-300/80 font-medium"
                        >Active apps</span
                      >
                    </div>
                    <div
                      class="text-2xl font-mono tabular-nums mt-1 text-violet-700 dark:text-violet-200"
                    >
                      {data.followUpsTotal}
                    </div>
                    <div class="text-[11px] text-muted-foreground">applied / screened</div>
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Applied or screened — consider follow-ups for any 5+ days old</Tooltip.Content
              >
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <div
                    {...props}
                    class={cn(
                      'rounded-lg border px-4 py-3',
                      data.pipelineDaysAgo == null
                        ? 'border-zinc-500/30 bg-zinc-500/5'
                        : data.pipelineDaysAgo >= 7
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-border/40 bg-card',
                    )}
                  >
                    <div class="flex items-center gap-1.5">
                      <Clock
                        class={cn(
                          'size-3.5',
                          data.pipelineDaysAgo != null && data.pipelineDaysAgo >= 7
                            ? 'text-amber-400'
                            : 'text-muted-foreground/70',
                        )}
                      />
                      <span
                        class={cn(
                          'text-[11px] uppercase tracking-wide font-medium',
                          data.pipelineDaysAgo != null && data.pipelineDaysAgo >= 7
                            ? 'text-amber-300/80'
                            : 'text-muted-foreground/70',
                        )}>Last scan</span
                      >
                    </div>
                    <div
                      class={cn(
                        'text-2xl font-mono tabular-nums mt-1',
                        data.pipelineDaysAgo == null
                          ? 'text-muted-foreground/40'
                          : data.pipelineDaysAgo >= 7
                            ? 'text-amber-200'
                            : 'text-foreground',
                      )}
                    >
                      {#if data.pipelineDaysAgo == null}
                        —
                      {:else if data.pipelineDaysAgo === 0}
                        today
                      {:else}
                        {data.pipelineDaysAgo}d
                      {/if}
                    </div>
                    <div class="text-[11px] text-muted-foreground">
                      {data.counts.totalJobs.toLocaleString()} jobs in pipeline
                    </div>
                  </div>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">
                {#if data.pipelineDaysAgo == null}
                  No scan history yet
                {:else if data.pipelineDaysAgo >= 7}
                  Pipeline is stale — consider running a fresh scan
                {:else}
                  data/pipeline.md last modified {data.pipelineDaysAgo === 0
                    ? 'today'
                    : data.pipelineDaysAgo + 'd ago'}
                {/if}
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </Tooltip.Provider>

        <!-- Quick actions -->
        <Tooltip.Provider delayDuration={250}>
          <div class="flex flex-wrap items-center gap-2">
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5"
                    onclick={() => runTask('scan', 'Scan')}
                    disabled={busyTask === 'scan' || data.runtime.runningTasks.includes('scan')}
                  >
                    {#if busyTask === 'scan' || data.runtime.runningTasks.includes('scan')}
                      <ActivityIcon class="size-3.5 animate-pulse text-emerald-400" />
                      Scanning…
                    {:else}
                      <Globe class="size-3.5" />
                      Run scan
                    {/if}
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                {#if data.runtime.runningTasks.includes('scan')}
                  scan-broad.py is running — check the activity feed
                {:else}
                  Pull new jobs from LinkedIn, Indeed, Greenhouse, Ashby, Lever, RemoteOK, We Work
                  Remotely, HN Hiring + The Muse
                {/if}
              </Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5"
                    onclick={() => runTask('gemini', 'Gemini scoring')}
                    disabled={!data.runtime.hasGemini ||
                      busyTask === 'gemini' ||
                      data.runtime.runningTasks.includes('gemini')}
                  >
                    {#if busyTask === 'gemini' || data.runtime.runningTasks.includes('gemini')}
                      <ActivityIcon class="size-3.5 animate-pulse text-blue-400" />
                      Scoring…
                    {:else}
                      <Sparkles class="size-3.5" />
                      Score with Gemini
                    {/if}
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                {#if !data.runtime.hasGemini}
                  Add a Gemini API key in Settings to enable cheap first-pass scoring
                {:else if data.runtime.runningTasks.includes('gemini')}
                  Scoring jobs in the background — refresh once it finishes
                {:else}
                  Run Gemini first-pass to triage unscored jobs cheaply
                {/if}
              </Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5"
                    onclick={() => globalActions.openAddJob()}
                  >
                    <Plus class="size-3.5" />
                    Add job
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Add a job by URL · keyboard shortcut: N</Tooltip.Content
              >
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="sm"
                    class="h-8 gap-1.5"
                    onclick={() => globalActions.openSearch()}
                  >
                    <Search class="size-3.5" />
                    Search
                    <kbd
                      class="ml-1 text-[11px] font-mono text-muted-foreground/60 px-1 py-0.5 rounded border border-border/50"
                      >⌘K</kbd
                    >
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Search across every job in your pipeline</Tooltip.Content
              >
            </Tooltip.Root>

            <div class="flex-1"></div>

            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href="/pipeline"
                    class="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md border border-input hover:bg-accent transition-colors"
                  >
                    <KanbanSquare class="size-3.5" />
                    Open Pipeline
                    <ChevronRight class="size-3" />
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs"
                >Full kanban board of every job, grouped by status</Tooltip.Content
              >
            </Tooltip.Root>
          </div>
        </Tooltip.Provider>
      </section>

      <!-- ===================== ALERTS ===================== -->
      {#if data.alerts.length > 0}
        <section class="space-y-2">
          {#each data.alerts as alert (alert.id)}
            {@const AIcon = alertIcon(alert.level)}
            <div
              class={cn(
                'flex items-start gap-3 px-3.5 py-2.5 rounded-md border',
                alertLevelTint[alert.level],
              )}
            >
              <AIcon class="size-4 mt-0.5 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{alert.title}</div>
                {#if alert.message}
                  <p class="text-[11px] opacity-80 leading-relaxed mt-0.5">{alert.message}</p>
                {/if}
              </div>
              {#if alert.actionLabel}
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 flex-shrink-0"
                  onclick={() => onAlertAction(alert)}
                  disabled={(alert.actionTask != null &&
                    (busyTask === alert.actionTask ||
                      data.runtime.runningTasks.includes(alert.actionTask))) ||
                    postingAlert === alert.id}
                >
                  {#if alert.actionTask != null && (busyTask === alert.actionTask || data.runtime.runningTasks.includes(alert.actionTask))}
                    <ActivityIcon class="size-3 animate-pulse" />
                    Running…
                  {:else if postingAlert === alert.id}
                    <ActivityIcon class="size-3 animate-pulse" />
                    Resuming…
                  {:else}
                    {alert.actionLabel}
                    <ArrowRight class="size-3" />
                  {/if}
                </Button>
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      <!-- ===================== AUTO-APPLY FAILURES ===================== -->
      <!--
        Surfaces every Issue with dedupeKey starting with "apply:" — one per
        job that the autonomous-apply drain bailed on. Each row's "Open posting"
        CTA pops the posting in a new tab so the user can finish by hand.
        Rows are deduped server-side so retries don't multiply.
      -->
      {#if data.applyIssues && data.applyIssues.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <Bell class="size-3 text-amber-400" />
            Auto-apply needs review · {data.applyIssues.length}
          </h2>
          {#each data.applyIssues as issue (issue.id)}
            {@const unknownLabels = parseUnknownFields(issue.detail)}
            {@const isUnknownField = unknownLabels.length > 0}
            {@const isExpanded = expandedIssueId === issue.id}
            <div
              class={cn(
                'rounded-md border',
                issue.severity === 'error'
                  ? 'border-red-500/40 bg-red-500/5'
                  : 'border-amber-500/40 bg-amber-500/5',
              )}
            >
              <div class="flex items-start gap-3 px-3.5 py-2.5">
                {#if issue.severity === 'error'}
                  <AlertCircle class="size-4 mt-0.5 text-red-400 flex-shrink-0" />
                {:else}
                  <AlertTriangle class="size-4 mt-0.5 text-amber-400 flex-shrink-0" />
                {/if}
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium">{issue.summary}</div>
                  {#if issue.detail}
                    <p
                      class="text-[11px] opacity-80 leading-relaxed mt-0.5 whitespace-pre-wrap font-mono"
                    >
                      {issue.detail.split('\n').slice(0, 3).join('\n')}
                    </p>
                  {/if}
                  <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span class="font-mono">{issue.source}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(issue.ts)}</span>
                  </div>
                </div>
                {#if isUnknownField}
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs gap-1.5 flex-shrink-0"
                    onclick={() => (expandedIssueId = isExpanded ? null : issue.id)}
                  >
                    {isExpanded ? 'Hide' : 'Save answers'}
                  </Button>
                {/if}
                {#if issue.fix?.href}
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs gap-1.5 flex-shrink-0"
                    onclick={() => window.open(issue.fix!.href, '_blank', 'noopener')}
                  >
                    {issue.fix.label}
                    <ArrowRight class="size-3" />
                  </Button>
                {/if}
              </div>
              <!-- Inline save-answer form (only for unknown-field issues) -->
              {#if isUnknownField && isExpanded}
                <div class="border-t border-amber-500/20 px-3.5 py-3 space-y-3 bg-amber-500/5">
                  <p class="text-[11px] text-amber-100/90 leading-relaxed">
                    Save an answer for each question below. Adapter will pull these from your
                    form-answers cache next time. Once saved, click <strong>Re-queue</strong> to retry
                    the apply.
                  </p>
                  {#each unknownLabels as label, i (label + i)}
                    {@const inputKey = issue.id + '/' + label}
                    <div class="space-y-1.5">
                      <div class="text-xs font-medium text-foreground">{label}</div>
                      <div class="flex items-start gap-2">
                        <textarea
                          rows="2"
                          placeholder="Your answer (e.g. '2 weeks' for notice period)"
                          class="flex-1 rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs font-sans resize-y"
                          value={answerInputs[inputKey] ?? ''}
                          oninput={(e) =>
                            (answerInputs = {
                              ...answerInputs,
                              [inputKey]: (e.currentTarget as HTMLTextAreaElement).value,
                            })}
                        ></textarea>
                        <Button
                          size="sm"
                          onclick={() => saveAnswerForIssue(issue.id, label)}
                          disabled={savingAnswer || !(answerInputs[inputKey] ?? '').trim()}
                          class="h-7 text-[11px] gap-1 flex-shrink-0"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  {/each}
                  <div class="flex items-center justify-between pt-1 border-t border-amber-500/20">
                    <p class="text-[11px] text-muted-foreground/80">
                      Stored under your profile's form-answers cache.
                      <a
                        href={'/profile?profile=' +
                          encodeURIComponent(data.profileId) +
                          '#autonomous-apply'}
                        class="underline">Manage all answers →</a
                      >
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => requeueJob(issue.jobId)}
                      disabled={requeueing === issue.jobId}
                      class="h-7 text-[11px] gap-1"
                    >
                      {#if requeueing === issue.jobId}
                        <ActivityIcon class="size-3 animate-pulse" /> Re-queuing…
                      {:else}
                        Re-queue apply
                      {/if}
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      <!-- ===================== POST-APPLY CARDS ===================== -->
      <!--
        Auto-derived "next action" cards from the JSON sidecars:
          thank-you-owed       — interviewers from the last 48h with no thank-you-path
          prep-block-recommended — upcoming interviews <5d away with no dossier
          ghosted-flagged      — applications silent ≥21d
          offer-decision-due   — offers with decisionDeadline within 72h
          next-action-due      — explicit nextActionDue items from stage-state
          follow-up-due        — followup cadence overdue (handled by separate section)

        Each card has a single CTA that navigates the user to the right
        anchor on the job page so the action is one click away.
      -->
      {#if data.postApplyCards && data.postApplyCards.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <Bell class="size-3 text-cyan-400" />
            Post-apply actions · {data.postApplyCards.length}
          </h2>
          <div class="space-y-1.5">
            {#each data.postApplyCards as card (card.id)}
              {@const tint =
                card.kind === 'thank-you-owed'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : card.kind === 'prep-block-recommended'
                    ? 'border-cyan-500/40 bg-cyan-500/5'
                    : card.kind === 'ghosted-flagged'
                      ? 'border-zinc-500/40 bg-zinc-500/5'
                      : card.kind === 'offer-decision-due'
                        ? 'border-orange-500/50 bg-orange-500/5'
                        : 'border-violet-500/40 bg-violet-500/5'}
              <a
                href={card.cta?.href ?? `/job/${card.jobId}`}
                class={cn(
                  'flex items-start gap-3 px-3.5 py-2.5 rounded-md border transition-colors hover:bg-zinc-900/50',
                  tint,
                )}
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium">{card.title}</div>
                  <div class="text-xs text-muted-foreground mt-0.5">{card.description}</div>
                </div>
                {#if card.cta}
                  <span class="text-xs text-cyan-300 whitespace-nowrap">{card.cta.label} →</span>
                {/if}
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- ===================== INBOUND RECRUITER LEADS ===================== -->
      <!--
        Emails classified as "recruiter-reach-out" by the email-reactor.
        These are recruiters who emailed the user about a NEW opportunity
        (not a follow-up on an existing application). Historically the
        highest-converting channel — surface up.
      -->
      {#if data.inboundLeads && data.inboundLeads.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <Sparkles class="size-3 text-emerald-400" />
            Inbound recruiter leads · {data.inboundLeads.length}
          </h2>
          <div class="space-y-1.5">
            {#each data.inboundLeads as lead}
              <div
                class="flex items-start gap-3 px-3.5 py-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5"
              >
                <Sparkles class="size-4 mt-0.5 text-emerald-300 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{lead.subject}</div>
                  <div class="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span class="font-mono truncate">{lead.sender}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(lead.ts)}</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- ===================== MAIN GRID ===================== -->
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <!-- LEFT COLUMN: Action queues -->
        <div class="space-y-5 min-w-0">
          <!-- Up next -->
          <section id="up-next" class="space-y-2.5 scroll-mt-4">
            <header class="flex items-center gap-2">
              <Flame class="size-4 text-emerald-400" />
              <h2 class="text-sm font-semibold">Up next — evaluate these</h2>
              <span class="text-[11px] text-muted-foreground tabular-nums"
                >{data.upNextTotal} total</span
              >
              <div class="flex-1"></div>
              {#if data.upNextTotal > data.upNext.length}
                <a
                  href="/pipeline?score=4"
                  class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                >
                  View all
                  <ChevronRight class="size-3" />
                </a>
              {/if}
            </header>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              High-fit jobs (≥ 4.0) with no deep evaluation report yet. Click to open and run a deep
              eval, or generate them all in batch.
            </p>
            {#if data.upNext.length > 0}
              <BulkActions
                cvCandidates={data.upNext}
                size="full"
                cvLabel="Generate CVs for all"
                applyLabel=""
              />
            {/if}
            {#if data.upNext.length === 0}
              <EmptyState
                size="md"
                variant="card"
                icon={Flame}
                title={data.counts.totalJobs === 0
                  ? 'Pipeline is empty'
                  : data.counts.unscored > 50
                    ? data.counts.unscored.toLocaleString() + ' jobs awaiting Gemini'
                    : 'All caught up on high-fit jobs'}
                description={data.counts.totalJobs === 0
                  ? 'Run a scan to find new jobs across all 7 sources.'
                  : data.counts.unscored > 50
                    ? 'Run Gemini first-pass to surface high-fit candidates from your pipeline.'
                    : 'No high-fit jobs (≥4.0) currently awaiting deep evaluation.'}
              />
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                {#each data.upNext as job (job.id)}
                  <JobCard {job} />
                {/each}
              </div>
            {/if}
          </section>

          <!-- Ready to apply -->
          {#if data.ready.length > 0}
            <section class="space-y-2.5">
              <header class="flex items-center gap-2">
                <Send class="size-4 text-blue-400" />
                <h2 class="text-sm font-semibold">Ready to apply</h2>
                <span class="text-[11px] text-muted-foreground tabular-nums"
                  >{data.readyTotal} total</span
                >
                <div class="flex-1"></div>
                {#if data.readyTotal > data.ready.length}
                  <a
                    href="/pipeline?tab=ready"
                    class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                  >
                    View all
                    <ChevronRight class="size-3" />
                  </a>
                {/if}
              </header>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Evaluation done · CV PDF ready. Open each one to send the application — or fire them
                all at once.
              </p>
              <!--
                Bulk Apply for the entire Ready bucket. Splits LinkedIn (auto)
                from non-LinkedIn (open + mark) and explains notification flow.
              -->
              <BulkActions
                applyCandidates={data.ready}
                size="full"
                applyLabel="Apply to all Ready"
                cvLabel=""
              />
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                {#each data.ready as job (job.id)}
                  <JobCard {job} />
                {/each}
              </div>
            </section>
          {/if}

          <!-- In flight -->
          {#if data.inFlight.length > 0}
            <section id="in-flight" class="space-y-2.5 scroll-mt-4">
              <header class="flex items-center gap-2">
                <Target class="size-4 text-orange-400" />
                <h2 class="text-sm font-semibold">In flight</h2>
                <span class="text-[11px] text-muted-foreground tabular-nums"
                  >{data.inFlightTotal} total</span
                >
              </header>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Active interviews and outstanding offers. Highest leverage of anything in your
                pipeline.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                {#each data.inFlight as job (job.id)}
                  <JobCard {job} />
                {/each}
              </div>
            </section>
          {/if}

          <!--
            Follow-ups due — surfaces from the daily cadence snapshot. We only
            render the urgent + overdue buckets here; the full grouped list
            lives on /applied. Click "View all" to jump there.
          -->
          {#if data.followupsUrgent.length > 0 || data.followupsOverdue.length > 0}
            <section id="follow-ups-due" class="space-y-2.5 scroll-mt-4">
              <header class="flex items-center gap-2">
                <Bell class="size-4 text-amber-400" />
                <h2 class="text-sm font-semibold">Follow-ups due</h2>
                <span class="text-[11px] text-muted-foreground tabular-nums">
                  {data.followupsUrgent.length + data.followupsOverdue.length} ready
                  {#if data.followupsCadenceMeta}
                    · {data.followupsCadenceMeta.actionable} active
                  {/if}
                </span>
                <div class="flex-1"></div>
                <a
                  href="/applied"
                  class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                >
                  View all
                  <ChevronRight class="size-3" />
                </a>
              </header>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Active applications past the cadence window. Click any one and use the More menu →
                Draft follow-up to generate a tuned message.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                {#each data.followupsUrgent as { job } (job.id)}
                  <JobCard {job} />
                {/each}
                {#each data.followupsOverdue as { job } (job.id)}
                  <JobCard {job} />
                {/each}
              </div>
            </section>
          {/if}

          <!-- Active applications -->
          {#if data.followUps.length > 0}
            <section id="follow-ups" class="space-y-2.5 scroll-mt-4">
              <header class="flex items-center gap-2">
                <ListTodo class="size-4 text-violet-400" />
                <h2 class="text-sm font-semibold">Active applications</h2>
                <span class="text-[11px] text-muted-foreground tabular-nums"
                  >{data.followUpsTotal} total</span
                >
                <div class="flex-1"></div>
                <a
                  href="/applied"
                  class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                >
                  View all
                  <ChevronRight class="size-3" />
                </a>
              </header>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Sent or screened — consider follow-ups for any 5+ days old.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                {#each data.followUps as job (job.id)}
                  <JobCard {job} />
                {/each}
              </div>
            </section>
          {/if}

          {#if data.upNext.length === 0 && data.ready.length === 0 && data.inFlight.length === 0 && data.followUps.length === 0}
            <EmptyState
              size="lg"
              variant="card"
              icon={InboxIcon}
              title="Inbox zero"
              description="Nothing waiting on you right now. Run a scan to find new jobs, or open the Pipeline to triage existing ones."
            >
              {#snippet actions()}
                <Button variant="outline" size="sm" onclick={() => runTask('scan', 'Scan')}>
                  <Globe class="size-3.5 mr-1.5" /> Run scan
                </Button>
                <a
                  href="/pipeline"
                  class="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md border border-input hover:bg-accent transition-colors"
                >
                  Open Pipeline
                </a>
              {/snippet}
            </EmptyState>
          {/if}
        </div>

        <!-- RIGHT COLUMN: Status / activity -->
        <aside class="space-y-3">
          <!-- This week -->
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-xs flex items-center gap-1.5">
                <Zap class="size-3.5 text-muted-foreground" /> This week
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
              <div class="flex items-end justify-between gap-2">
                <div>
                  <div class="text-2xl font-semibold tabular-nums">{data.last7}</div>
                  <div class="text-[11px] text-muted-foreground">applications · last 7d</div>
                </div>
                {#if data.velocityDeltaPct != null}
                  <Badge
                    variant="outline"
                    class={cn(
                      'h-5 text-[11px] gap-0.5',
                      data.velocityDeltaPct >= 0
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-300',
                    )}
                  >
                    {#if data.velocityDeltaPct >= 0}<TrendingUp
                        class="size-2.5"
                      />{:else}<TrendingDown class="size-2.5" />{/if}
                    {data.velocityDeltaPct >= 0 ? '+' : ''}{data.velocityDeltaPct}%
                  </Badge>
                {/if}
              </div>
              <div class="text-emerald-400">
                <Sparkline data={velocityNumbers} width={300} height={48} />
              </div>
              <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>vs prior 7d: {data.prev7}</span>
                <a href="/stats" class="hover:text-foreground inline-flex items-center gap-0.5">
                  Stats
                  <ChevronRight class="size-2.5" />
                </a>
              </div>
            </Card.Content>
          </Card.Root>

          <!-- Top sources -->
          {#if data.topSources.length > 0}
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-xs flex items-center gap-1.5">
                  <Globe class="size-3.5 text-muted-foreground" /> Top sources
                </Card.Title>
              </Card.Header>
              <Card.Content class="space-y-1">
                {#each data.topSources as src}
                  {@const pct =
                    data.counts.totalJobs > 0 ? (src.count / data.counts.totalJobs) * 100 : 0}
                  <div class="flex items-center gap-2 text-xs">
                    <span class="flex-1 overflow-hidden whitespace-nowrap">{src.name}</span>
                    <div class="h-1 w-12 rounded-full bg-muted overflow-hidden">
                      <div class="h-full bg-foreground/40" style={'width: ' + pct + '%'}></div>
                    </div>
                    <span class="text-[11px] tabular-nums text-muted-foreground w-8 text-right"
                      >{src.count}</span
                    >
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}

          <!-- Activity feed -->
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-xs flex items-center gap-1.5">
                <ActivityIcon class="size-3.5 text-muted-foreground" /> Recent activity
                {#if data.recentErrorsCount > 0}
                  <Badge
                    variant="outline"
                    class="h-4 px-1 text-[9px] border-red-500/40 bg-red-500/10 text-red-300 ml-auto"
                  >
                    {data.recentErrorsCount}
                    {data.recentErrorsCount === 1 ? 'error' : 'errors'}
                  </Badge>
                {/if}
              </Card.Title>
            </Card.Header>
            <Card.Content>
              {#if data.activity.length === 0}
                <EmptyState
                  size="sm"
                  variant="inline"
                  icon={ActivityIcon}
                  description="No activity yet — kick off a scan or evaluation."
                />
              {:else}
                <ul class="space-y-2">
                  {#each data.activity as ev (ev.id)}
                    <li class="flex items-start gap-2 text-[11px]">
                      <span
                        class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', levelDot(ev.level))}
                      ></span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-1.5">
                          <span class="font-medium overflow-hidden whitespace-nowrap"
                            >{ev.title}</span
                          >
                          <span class="text-[11px] text-muted-foreground/70 ml-auto flex-shrink-0"
                            >{formatRelativeTime(ev.ts)}</span
                          >
                        </div>
                        {#if ev.message}
                          <p
                            class="text-muted-foreground/80 mt-0.5 leading-relaxed overflow-hidden whitespace-nowrap"
                          >
                            {ev.message}
                          </p>
                        {/if}
                        <div class="text-[9px] text-muted-foreground/60 font-mono mt-0.5">
                          {ev.source}
                        </div>
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            </Card.Content>
          </Card.Root>

          <!-- Connected services / runtime mini -->
          <Card.Root>
            <Card.Header class="pb-2">
              <Card.Title class="text-xs flex items-center gap-1.5">
                <Briefcase class="size-3.5 text-muted-foreground" /> Connected
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-1.5">
              {#each [{ label: 'Gemini', on: data.runtime.hasGemini, role: 'first-pass scoring' }, { label: 'Anthropic', on: data.runtime.hasAnthropic, role: 'deep evaluation, chat' }] as svc}
                <div class="flex items-center gap-2 text-xs">
                  <span
                    class={cn('size-1.5 rounded-full', svc.on ? 'bg-emerald-500' : 'bg-zinc-500')}
                  ></span>
                  <span class={svc.on ? 'text-foreground' : 'text-muted-foreground/60'}
                    >{svc.label}</span
                  >
                  <span class="text-[11px] text-muted-foreground/60 ml-auto"
                    >{svc.on ? svc.role : 'not configured'}</span
                  >
                </div>
              {/each}
              <a
                href="/runtimes"
                class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 mt-1"
              >
                See full health report
                <ChevronRight class="size-2.5" />
              </a>
            </Card.Content>
          </Card.Root>
        </aside>
      </div>
    </div>
  </div>
</div>
