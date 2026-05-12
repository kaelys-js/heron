<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import StatusColumn from '$lib/components/StatusColumn.svelte';
  import JobList from '$lib/components/JobList.svelte';
  import JobRowCompact from '$lib/components/JobRowCompact.svelte';
  import JobTable from '$lib/components/JobTable.svelte';
  import JobCard from '$lib/components/JobCard.svelte';
  import CompanyGroup from '$lib/components/CompanyGroup.svelte';
  import PipelineFlowExplainer from '$lib/components/PipelineFlowExplainer.svelte';
  import PaginationFooter from '$lib/components/PaginationFooter.svelte';
  import BulkActions from '$lib/components/BulkActions.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { Inbox as InboxIcon } from '@lucide/svelte';
  import { STATUS_ORDER, DEFAULT_FILTER, tabStatuses, type Status, type Job, type SortKey, type TabFilter, type ViewMode, type FilterState } from '$lib/types';
  import { page } from '$app/state';
  import { afterNavigate, replaceState } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { reportClientError } from '$lib/notifications.svelte';
  import { api } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import { Activity, Loader2 } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

  let { data }: { data: { jobs: Job[]; total: number; initialTab: TabFilter; initialFilter: FilterState; fromProject: string | null } } = $props();
  // svelte-ignore state_referenced_locally — server data seeds local mutable state on first render.
  let activeTab = $state<TabFilter>(data.initialTab);
  let sort = $state<SortKey>('score-desc');

  // Persist viewMode to localStorage so the user's choice sticks across reloads
  const VIEW_KEY = `${BRAND_STORAGE_PREFIX}:pipeline-view`;
  function readViewMode(): ViewMode {
    if (typeof window === 'undefined') return 'board';
    try {
      const v = window.localStorage.getItem(VIEW_KEY) as ViewMode | null;
      if (v && ['board', 'list', 'compact', 'table', 'by-company'].includes(v)) return v;
    } catch {}
    return 'board';
  }
  let viewMode = $state<ViewMode>(readViewMode());
  onMount(() => {
    // re-read after hydration in case localStorage was unavailable during SSR-equivalent first-pass
    viewMode = readViewMode();
  });
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  });
  // svelte-ignore state_referenced_locally — server seeds initial filter; user controls afterward.
  let filter = $state<FilterState>({ ...data.initialFilter, bgRisk: { ...data.initialFilter.bgRisk } });

  // `afterNavigate` fires once the router is initialized, including the very first navigation.
  // This is the canonical gate for client-only navigation APIs like `replaceState`.
  let routerReady = $state(false);
  afterNavigate(() => { routerReady = true; });

  function syncTabToUrl(t: TabFilter) {
    if (!browser || !routerReady) return;
    try {
      const u = new URL(page.url);
      if (t === 'all') u.searchParams.delete('tab');
      else u.searchParams.set('tab', t);
      // No-op when the URL hasn't actually changed — avoids a useless history entry.
      if (u.searchParams.toString() === page.url.searchParams.toString()) return;
      replaceState(u, page.state);
    } catch (e) {
      // Defense in depth: never crash the page over a URL sync hiccup. Funnel
      // through reportClientError so it lands in the bell + console with stack.
      reportClientError('pipeline-page', 'Tab → URL sync skipped', e);
    }
  }

  $effect(() => {
    if (!routerReady) return;
    syncTabToUrl(activeTab);
  });

  const STATUS_TINTS: Record<string, string> = {
    Ready: 'bg-emerald-500/[0.04] border-emerald-500/30',
    Interview: 'bg-orange-500/[0.04] border-orange-500/30',
    Offer: 'bg-green-500/[0.06] border-green-500/40',
  };

  let visibleStatuses = $derived(tabStatuses(activeTab));

  function passesFilter(j: Job): boolean {
    const score = j.score ?? j.geminiScore ?? 0;
    if (filter.minScore > 0 && score < filter.minScore) return false;
    if (j.bgRisk && filter.bgRisk[j.bgRisk] === false) return false;
    const wm = j.workMode ?? 'unknown';
    if (filter.workMode[wm] === false) return false;
    if (filter.hasPdf && !j.pdfFile) return false;
    if (filter.hasReport && !j.reportFile) return false;
    if (filter.hasSalary && !j.salary) return false;
    // Source filter — '' means "all sources"; anything else must match
    // exactly the scan-history source identifier.
    if (filter.source && j.source !== filter.source) return false;
    if (filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      if (!j.company.toLowerCase().includes(q) &&
          !j.role.toLowerCase().includes(q) &&
          !(j.location ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function applySort(jobs: Job[]): Job[] {
    const sorted = [...jobs];
    
switch (sort) {
      case 'score-desc':
        sorted.sort((a, b) => (b.score ?? b.geminiScore ?? -1) - (a.score ?? a.geminiScore ?? -1));
        break;
      case 'score-asc':
        sorted.sort((a, b) => (a.score ?? a.geminiScore ?? Infinity) - (b.score ?? b.geminiScore ?? Infinity));
        break;
      case 'company-asc':
        sorted.sort((a, b) => a.company.localeCompare(b.company));
        break;
      case 'date-desc':
        sorted.sort((a, b) => (b.pipelineIndex ?? 0) - (a.pipelineIndex ?? 0));
        break;
    }
    return sorted;
  }

  // Filtered + sorted jobs grouped by status
  let filtered = $derived.by<Record<Status, Job[]>>(() => {
    const out = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: [] }), {} as Record<Status, Job[]>);
    
for (const job of data.jobs) {
      if (!passesFilter(job)) continue;
      out[job.status].push(job);
    }
    for (const s of STATUS_ORDER) out[s] = applySort(out[s]);
    return out;
  });

  let totalVisible = $derived.by(() => {
    return visibleStatuses.reduce((n, s) => n + (filtered[s]?.length ?? 0), 0);
  });

  let listJobs = $derived.by(() => {
    return visibleStatuses.flatMap((s) => filtered[s] ?? []);
  });

  // Group flat job list by company for the by-company view
  let byCompany = $derived.by<{ company: string; jobs: Job[] }[]>(() => {
    const groups = new Map<string, Job[]>();
    for (const j of listJobs) {
      const key = j.company || '(unknown)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(j);
    }
    return [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([company, jobs]) => ({ company, jobs }));
  });

  // ---- Pagination shared across Compact / List / Table ----
  // Track previous count so freshly-revealed rows can animate in (CSS .animate-in via
  // tw-animate-css). prevVisibleCount catches up after each render.
  const PAGE_SIZE = 25;
  let visibleCount = $state(PAGE_SIZE);
  let prevVisibleCount = $state(PAGE_SIZE);
  // Reset pagination whenever the underlying flat list changes substantially (e.g. tab switch)
  $effect(() => {
    const _ = listJobs.length;
    if (visibleCount > _ && _ > 0) visibleCount = Math.min(visibleCount, Math.max(PAGE_SIZE, _));
    if (_ < PAGE_SIZE) {
      visibleCount = _;
      prevVisibleCount = _;
    }
  });
  // After visibleCount changes, snap prevVisibleCount up so subsequent renders don't keep animating.
  $effect(() => {
    const c = visibleCount;
    queueMicrotask(() => { prevVisibleCount = c; });
  });
  let pagedJobs = $derived(listJobs.slice(0, visibleCount));

  // ---- Bulk-action candidate sets ----
  // Apply: visible jobs in status "Ready" (eval done · CV ready · go).
  let bulkApplyCandidates = $derived(listJobs.filter((j) => j.status === 'Ready'));
  // CV: visible jobs scored ≥ 4 that haven't had a CV generated yet.
  // Cap at 25 so we don't queue an enormous batch by accident.
  let bulkCvCandidates = $derived.by(() => {
    const candidates = listJobs.filter((j) => {
      const s = j.score ?? j.geminiScore ?? 0;
      return s >= 4 && !j.pdfFile && j.status !== 'Closed' && j.status !== 'Rejected';
    });
    return candidates.slice(0, 25);
  });

  // Liveness sweep candidates: visible jobs that look like they could be stale
  // (New / Scored / Ready). >10 makes the bulk button worth showing — the user
  // can also run a sweep at any time from Settings → Maintenance.
  let livenessCandidateCount = $derived(
    listJobs.filter((j) => ['New', 'Scoring', 'Scored', 'Ready'].includes(j.status)).length,
  );
  let livenessBusy = $state(false);

  async function runLivenessSweep() {
    if (livenessBusy) return;
    livenessBusy = true;
    try {
      await api.post('/api/bulk/liveness', { scope: 'stale' }, { silent: true });
      toast.success('Liveness sweep queued', {
        description: 'Walking up to ~200 URLs through Playwright. Expired postings auto-close; uncertain ones land in the Inbox. Watch the bell for completion.',
        duration: 8_000,
      });
    } catch (e) {
      const err = e as { message?: string };
      toast.error('Failed to queue liveness sweep', {
        description: err.message ?? 'Network error',
        action: { label: 'Retry', onClick: () => runLivenessSweep() },
      });
    } finally {
      livenessBusy = false;
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Pipeline"
    bind:activeTab
    bind:sort
    bind:viewMode
    bind:filter
  />
  <div class="p-4 space-y-4">
    <PipelineFlowExplainer />

    <!--
      Bulk actions bar — only renders when there are Ready jobs to apply to or
      high-fit jobs to generate CVs for in the currently filtered view.
    -->
    {#if bulkApplyCandidates.length > 0 || bulkCvCandidates.length > 0}
      <BulkActions
        applyCandidates={bulkApplyCandidates}
        cvCandidates={bulkCvCandidates}
        size="full"
        applyLabel="Apply to all Ready"
        cvLabel="Generate CVs for high-fit"
      />
    {/if}

    <!--
      Liveness sweep — surfaces when there are enough open jobs that some are
      probably dead links. The sweep itself runs weekly via Autopilot; this
      button is the "check now" escape hatch.
    -->
    {#if livenessCandidateCount >= 10}
      <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20 text-xs">
        <Activity class="size-3.5 text-blue-400/80 flex-shrink-0" />
        <span class="flex-1 min-w-0">
          <span class="font-medium">{livenessCandidateCount} open jobs</span>
          <span class="text-muted-foreground">— some links may be dead. Run a liveness sweep to auto-close expired postings.</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          class="h-7 text-xs gap-1.5 flex-shrink-0"
          onclick={runLivenessSweep}
          disabled={livenessBusy}
        >
          {#if livenessBusy}
            <Loader2 class="size-3 animate-spin" /> Queueing…
          {:else}
            <Activity class="size-3" /> Liveness sweep
          {/if}
        </Button>
      </div>
    {/if}

    {#if listJobs.length === 0}
      <EmptyState
        size="lg"
        variant="card"
        icon={InboxIcon}
        title="No jobs match"
        description="Your filters narrowed down to zero results. Reset filters or run a fresh scan."
      />
    {:else if viewMode === 'board'}
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
        {#each visibleStatuses as status}
          <StatusColumn title={status} jobs={filtered[status] ?? []} tint={STATUS_TINTS[status] ?? ''} />
        {/each}
      </div>
    {:else if viewMode === 'list'}
      <JobList jobs={pagedJobs} {prevVisibleCount} />
      <PaginationFooter total={listJobs.length} bind:visible={visibleCount} pageSize={PAGE_SIZE} class="rounded-md border border-border/40 bg-card mt-2" />
    {:else if viewMode === 'compact'}
      <div class="rounded-md border border-border/40 bg-card overflow-hidden">
        <!-- Header columns must EXACTLY match JobRowCompact's column widths/gaps to align -->
        <Tooltip.Provider delayDuration={300}>
          <div class="flex items-center gap-3 px-3 h-7 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/40 bg-muted/30 border-l-2 border-l-transparent">
            <span class="size-1.5 flex-shrink-0"></span>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-8 flex-shrink-0 text-right cursor-help">Score</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs max-w-xs">Fit score 0–5 (deep eval) · ~ Gemini first-pass</Tooltip.Content>
            </Tooltip.Root>
            <span class="flex-1 min-w-0">Role</span>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-40 flex-shrink-0 cursor-help">Company</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Hiring company name</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-24 flex-shrink-0 cursor-help">Source</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs max-w-xs">Where this URL was first surfaced — direct ATS scan, JobSpy aggregator, niche board, email alert, etc.</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-36 flex-shrink-0 cursor-help">Location</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Posting location requirement</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-20 flex-shrink-0 cursor-help">Mode</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Remote / Hybrid / On-site (parsed from JD)</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-14 flex-shrink-0 text-center cursor-help">BG</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Background-check risk tier</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-32 flex-shrink-0 cursor-help">Salary</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Comp range from posting (when stated)</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-12 flex-shrink-0 text-right cursor-help">·</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Has report / Has CV PDF indicators</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="w-24 flex-shrink-0 text-right cursor-help">Actions</span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" class="text-xs">Apply · change status · generate CV · more</Tooltip.Content>
            </Tooltip.Root>
          </div>
        </Tooltip.Provider>
        <div class="divide-y divide-border/20">
          {#each pagedJobs as job, i (job.id)}
            <div class={i >= prevVisibleCount && i < visibleCount ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}>
              <JobRowCompact {job} />
            </div>
          {/each}
        </div>
        <PaginationFooter total={listJobs.length} bind:visible={visibleCount} pageSize={PAGE_SIZE} />
      </div>
    {:else if viewMode === 'table'}
      <JobTable jobs={pagedJobs} {prevVisibleCount} />
      <PaginationFooter total={listJobs.length} bind:visible={visibleCount} pageSize={PAGE_SIZE} class="rounded-md border border-t-0 border-border/40 bg-card -mt-px" />
    {:else if viewMode === 'by-company'}
      <div class="space-y-2">
        {#each byCompany as group (group.company)}
          <CompanyGroup company={group.company} jobs={group.jobs} />
        {/each}
      </div>
    {/if}
  </div>
</div>
