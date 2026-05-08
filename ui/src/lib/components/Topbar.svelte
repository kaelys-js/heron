<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import {
    Filter, ArrowDownUp, LayoutGrid, List, X, Search, ArrowDownWideNarrow, ArrowUpWideNarrow,
    ArrowDownAZ, Clock, Layers, Rows3, Table2, Building2, Star, ShieldCheck, Wifi, Building,
    Globe, FileText, FileBadge2, DollarSign, RotateCcw,
  } from '@lucide/svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import NotificationsBell from './NotificationsBell.svelte';
  import ConnectionBanner from './ConnectionBanner.svelte';
  import TaskIndicator from './TaskIndicator.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import CheckMark from './CheckMark.svelte';
  import type { TabFilter, SortKey, ViewMode, FilterState, BgRisk, Status, WorkMode } from '$lib/types';
  import { DEFAULT_FILTER, BG_TINTS, STATUS_ORDER, TAB_PRESETS, tabLabel } from '$lib/types';
  import { cn } from '$lib/utils';
  import { APP_NAME, docTitle as buildDocTitle } from '$lib/config/branding';

  let {
    title,
    subtitle,
    breadcrumb,
    breadcrumbHref = '/',
    showTabs = true,
    activeTab = $bindable('all'),
    sort = $bindable('score-desc'),
    viewMode = $bindable('board'),
    filter = $bindable(DEFAULT_FILTER),
    onTabChange = (t: string) => {},
  }: {
    title: string;
    subtitle?: string;
    breadcrumb?: string;
    breadcrumbHref?: string;
    showTabs?: boolean;
    activeTab?: TabFilter;
    sort?: SortKey;
    viewMode?: ViewMode;
    filter?: FilterState;
    onTabChange?: (t: string) => void;
  } = $props();

  // Default breadcrumb to the app name. Pages can override (e.g. "Pipeline" on job detail).
  let crumb = $derived(breadcrumb ?? APP_NAME);

  // ---- Sort options ----
  const SORTS: { key: SortKey; label: string; desc: string; icon: any }[] = [
    { key: 'score-desc',  label: 'Score · high → low',  desc: 'Best fits first',                icon: ArrowDownWideNarrow },
    { key: 'score-asc',   label: 'Score · low → high',  desc: 'Worst fits first (review skips)', icon: ArrowUpWideNarrow },
    { key: 'date-desc',   label: 'Recently added',      desc: 'Newest in pipeline first',       icon: Clock },
    { key: 'company-asc', label: 'Company · A → Z',     desc: 'Alphabetical by company name',   icon: ArrowDownAZ },
  ];
  let activeSort = $derived(SORTS.find((s) => s.key === sort) ?? SORTS[0]);
  let sortShort = $derived(activeSort.label.split('·')[0].trim());

  // ---- View modes ----
  const VIEWS: { key: ViewMode; label: string; icon: any; desc: string }[] = [
    { key: 'board',      label: 'Board',         icon: LayoutGrid, desc: 'Kanban columns by status' },
    { key: 'list',       label: 'List',          icon: List,       desc: 'Cards stacked vertically' },
    { key: 'compact',    label: 'Compact',       icon: Rows3,      desc: 'One-line rows · denser' },
    { key: 'table',      label: 'Table',         icon: Table2,     desc: 'Sortable spreadsheet' },
    { key: 'by-company', label: 'By company',    icon: Building2,  desc: 'Grouped sections per company' },
  ];
  let activeView = $derived(VIEWS.find((v) => v.key === viewMode) ?? VIEWS[0]);

  // ---- Tab presets — descriptions shown in dropdown ----
  const PRESET_DESC: Record<string, string> = {
    all:     'Every status — no filtering by stage',
    ready:   'Eval done · CV PDF generated · ready to send',
    applied: 'Applied · Screened · Interview · Offer (active applications)',
  };

  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote',
    Ready: 'Eval done · CV PDF ready · go apply',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    Interview: 'Active interview process',
    Offer: 'Offer in hand · negotiate',
    Rejected: 'Closed by company',
    Closed: 'You skipped this one',
  };

  const STATUS_DOTS: Record<Status, string> = {
    New: 'bg-zinc-400',     Scoring: 'bg-blue-400',  Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400', Applied: 'bg-violet-400', Screened: 'bg-amber-400',
    Interview: 'bg-orange-400', Offer: 'bg-green-400', Rejected: 'bg-red-400', Closed: 'bg-zinc-500',
  };

  let activeTabLabel = $derived(tabLabel(activeTab));

  function setTab(t: TabFilter) {
    activeTab = t;
    onTabChange(t);
  }

  // Tab title: "<Title> · <Breadcrumb> — APP_NAME". When breadcrumb === APP_NAME, drop it.
  let docTitle = $derived(
    crumb && crumb !== title && crumb !== APP_NAME
      ? buildDocTitle([title, crumb])
      : buildDocTitle([title])
  );

  // ---- Filter logic ----
  const SCORE_TIERS: { value: number; label: string; desc: string }[] = [
    { value: 0,   label: 'Any',   desc: 'All scores' },
    { value: 3,   label: '3.0+', desc: 'Decent fit and up' },
    { value: 4,   label: '4.0+', desc: 'Standard cutoff' },
    { value: 4.5, label: '4.5+', desc: 'Strong fits only' },
  ];
  function setMinScore(v: number) {
    filter = { ...filter, minScore: v };
  }

  const BG_KEYS: NonNullable<BgRisk>[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKED'];
  const BG_DESC: Record<NonNullable<BgRisk>, string> = {
    LOW: 'Small startups — BG check unlikely',
    MEDIUM: 'Standard Checkr-grade screen',
    HIGH: 'SOX/FINRA-grade — disclosure plan needed',
    BLOCKED: 'Hard stop — explicit clearance required',
  };
  function toggleBg(k: NonNullable<BgRisk>) {
    filter = { ...filter, bgRisk: { ...filter.bgRisk, [k]: !filter.bgRisk[k] } };
  }

  type WorkModeDef = { key: WorkMode; label: string; icon: any; tint: string };
  const WORK_MODES: WorkModeDef[] = [
    { key: 'remote',  label: 'Remote',  icon: Wifi,     tint: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' },
    { key: 'hybrid',  label: 'Hybrid',  icon: Building, tint: 'bg-amber-500/10 text-amber-300 border-amber-500/40' },
    { key: 'onsite',  label: 'On-site', icon: Building, tint: 'bg-red-500/10 text-red-300 border-red-500/40' },
    { key: 'unknown', label: 'Unclear', icon: Globe,    tint: 'bg-muted text-muted-foreground border-border' },
  ];
  function toggleWorkMode(k: WorkMode) {
    filter = { ...filter, workMode: { ...filter.workMode, [k]: !filter.workMode[k] } };
  }

  // ---- Dirty / counts per filter section (for inline indicators) ----
  let scoreActive   = $derived(filter.minScore > 0);
  let bgActive      = $derived(BG_KEYS.some((k) => filter.bgRisk[k] !== DEFAULT_FILTER.bgRisk[k]));
  let workModeActive = $derived((['remote','hybrid','onsite','unknown'] as WorkMode[]).some((k) => filter.workMode[k] !== DEFAULT_FILTER.workMode[k]));
  let extrasActive  = $derived(filter.hasReport || filter.hasPdf || filter.hasSalary);

  let activeFilterCount = $derived(
    [scoreActive, bgActive, workModeActive, extrasActive, !!filter.search.trim()].filter(Boolean).length,
  );

  function clearFilter() {
    filter = {
      ...DEFAULT_FILTER,
      bgRisk: { ...DEFAULT_FILTER.bgRisk },
      workMode: { ...DEFAULT_FILTER.workMode },
    };
  }

  function resetSection(section: 'score' | 'bg' | 'workMode' | 'extras') {
    if (section === 'score') filter = { ...filter, minScore: 0 };
    else if (section === 'bg') filter = { ...filter, bgRisk: { ...DEFAULT_FILTER.bgRisk } };
    else if (section === 'workMode') filter = { ...filter, workMode: { ...DEFAULT_FILTER.workMode } };
    else if (section === 'extras') filter = { ...filter, hasReport: false, hasPdf: false, hasSalary: false };
  }
</script>

<svelte:head>
  <title>{docTitle}</title>
</svelte:head>

<!--
  Sticky-friendly Topbar: outer div sticks to the top of its scroll container.
  Pages must put <Topbar /> as a child of a scroll container (e.g. `<div class="h-full overflow-y-auto">`).
  `app-shell-topbar` opts this element out of the page-content view transition
  (see app.css) so the topbar stays put while only the content below fades.
-->
<div class="app-shell-topbar sticky top-0 z-30 flex flex-col bg-card/85 backdrop-blur-md">
  <header class="flex h-14 items-center gap-3 border-b px-4">
    <Sidebar.Trigger class="-ml-1" />
    <div class="flex items-center gap-2 text-sm flex-1 min-w-0">
      {#if crumb}
        <a
          href={breadcrumbHref}
          class="text-muted-foreground hover:text-foreground transition-colors rounded px-1 -mx-1 hover:bg-muted/40"
          data-sveltekit-preload-data="hover"
        >{crumb}</a>
        <span class="text-muted-foreground/50">/</span>
      {/if}
      <span class="font-medium truncate">{title}</span>
      {#if subtitle}
        <span class="text-muted-foreground text-xs">· {subtitle}</span>
      {/if}
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <ConnectionBanner />
      <TaskIndicator />
      <ThemeToggle />
      <NotificationsBell />
    </div>
  </header>

  {#if showTabs}
    <div class="flex items-center justify-between border-b px-4 py-2 gap-2 flex-wrap">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <!-- TAB DROPDOWN -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="outline" size="sm" class="h-8 gap-1.5 text-xs min-w-[110px] justify-start">
                <Layers class="size-3.5" />
                <span class="text-muted-foreground">Tab:</span>
                <span class="text-foreground font-medium truncate">{activeTabLabel}</span>
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="bottom" align="start" class="w-72 max-h-[70vh] overflow-y-auto">
            <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Presets</DropdownMenu.Label>
            {#each TAB_PRESETS as p}
              <DropdownMenu.Item
                onSelect={() => setTab(p.value)}
                closeOnSelect={false}
                class="gap-2 items-start py-2"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{p.label}</div>
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{PRESET_DESC[p.value] ?? ''}</div>
                </div>
                <CheckMark active={activeTab === p.value} class="mt-0.5" />
              </DropdownMenu.Item>
            {/each}

            <DropdownMenu.Separator />
            <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Single column</DropdownMenu.Label>
            {#each STATUS_ORDER as s}
              {@const v = ('s:' + s) as TabFilter}
              <DropdownMenu.Item
                onSelect={() => setTab(v)}
                closeOnSelect={false}
                class="gap-2 items-start py-1.5"
              >
                <span class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', STATUS_DOTS[s])}></span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{s}</div>
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{STATUS_HINT[s]}</div>
                </div>
                <CheckMark active={activeTab === v} class="mt-0.5" />
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- SEARCH -->
        <div class="relative max-w-xs flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            bind:value={filter.search}
            placeholder="Find a job (company, role, location)…"
            class="h-8 pl-8 text-sm"
          />
          {#if filter.search}
            <button
              onclick={() => (filter = { ...filter, search: '' })}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X class="size-3" />
            </button>
          {/if}
        </div>
      </div>

      <div class="flex items-center gap-1">
        <!-- FILTER POPOVER -->
        <Popover.Root>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="sm" class={cn('h-8 gap-1.5 text-xs relative', activeFilterCount > 0 && 'text-foreground')}>
                <Filter class="size-3.5" />
                Filter
                {#if activeFilterCount > 0}
                  <span class="text-[10px] font-mono tabular-nums px-1 py-0 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40">
                    {activeFilterCount}
                  </span>
                {/if}
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content side="bottom" align="end" class="w-[400px] p-0 max-h-[80vh] overflow-y-auto">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-popover z-10">
              <div class="flex items-baseline gap-2">
                <span class="text-sm font-semibold">Filters</span>
                {#if activeFilterCount > 0}
                  <span class="text-[10px] text-muted-foreground tabular-nums">
                    {activeFilterCount} {activeFilterCount === 1 ? 'active' : 'active'}
                  </span>
                {/if}
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-[11px] gap-1 disabled:opacity-30"
                disabled={activeFilterCount === 0}
                onclick={clearFilter}
              >
                <RotateCcw class="size-3" />
                Reset all
              </Button>
            </div>

            <div class="px-4 py-4 space-y-5">
              <!-- SCORE -->
              <section class="space-y-2">
                <header class="flex items-center justify-between">
                  <Label class="text-xs flex items-center gap-1.5">
                    <Star class={cn('size-3', scoreActive ? 'text-amber-400' : 'text-muted-foreground/60')} />
                    Minimum score
                    {#if scoreActive}
                      <span class="text-[10px] text-amber-400/80 font-mono">≥{filter.minScore}</span>
                    {/if}
                  </Label>
                  {#if scoreActive}
                    <button type="button" onclick={() => resetSection('score')} class="text-[10px] text-muted-foreground hover:text-foreground transition-colors">reset</button>
                  {/if}
                </header>
                <div class="grid grid-cols-4 rounded-md border border-border overflow-hidden">
                  {#each SCORE_TIERS as tier, i}
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <button
                              {...props}
                              type="button"
                              onclick={() => setMinScore(tier.value)}
                              class={cn(
                                'h-8 text-xs font-medium transition-colors',
                                i > 0 && 'border-l border-border',
                                filter.minScore === tier.value
                                  ? 'bg-foreground text-background'
                                  : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                              )}
                            >
                              {tier.label}
                            </button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="top" class="text-xs">{tier.desc}</Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  {/each}
                </div>
              </section>

              <!-- WORK MODE -->
              <section class="space-y-2">
                <header class="flex items-center justify-between">
                  <Label class="text-xs flex items-center gap-1.5">
                    <Wifi class={cn('size-3', workModeActive ? 'text-emerald-400' : 'text-muted-foreground/60')} />
                    Work mode
                  </Label>
                  {#if workModeActive}
                    <button type="button" onclick={() => resetSection('workMode')} class="text-[10px] text-muted-foreground hover:text-foreground transition-colors">reset</button>
                  {/if}
                </header>
                <p class="text-[10px] text-muted-foreground/70">Toggle off to exclude that mode from the pipeline.</p>
                <div class="grid grid-cols-2 gap-1.5">
                  {#each WORK_MODES as wm}
                    {@const on = filter.workMode[wm.key]}
                    {@const WIcon = wm.icon}
                    <button
                      type="button"
                      onclick={() => toggleWorkMode(wm.key)}
                      class={cn(
                        'h-8 px-2.5 rounded-md border inline-flex items-center gap-1.5 text-xs transition-all',
                        on
                          ? wm.tint + ' shadow-sm'
                          : 'bg-transparent border-border/40 text-muted-foreground/50 hover:border-border hover:text-muted-foreground'
                      )}
                    >
                      <WIcon class="size-3" />
                      <span class="font-medium">{wm.label}</span>
                      <CheckMark active={on} class="ml-auto" />
                    </button>
                  {/each}
                </div>
              </section>

              <!-- BACKGROUND CHECK RISK -->
              <section class="space-y-2">
                <header class="flex items-center justify-between">
                  <Label class="text-xs flex items-center gap-1.5">
                    <ShieldCheck class={cn('size-3', bgActive ? 'text-amber-400' : 'text-muted-foreground/60')} />
                    Background-check risk
                  </Label>
                  {#if bgActive}
                    <button type="button" onclick={() => resetSection('bg')} class="text-[10px] text-muted-foreground hover:text-foreground transition-colors">reset</button>
                  {/if}
                </header>
                <p class="text-[10px] text-muted-foreground/70">Default excludes BLOCKED jobs. Toggle others off to narrow further.</p>
                <div class="space-y-1">
                  {#each BG_KEYS as bg}
                    {@const on = filter.bgRisk[bg]}
                    <button
                      type="button"
                      onclick={() => toggleBg(bg)}
                      class={cn(
                        'w-full px-2.5 py-1.5 rounded-md border flex items-center gap-2 text-xs transition-all',
                        on
                          ? BG_TINTS[bg] + ' shadow-sm'
                          : 'bg-transparent border-border/40 text-muted-foreground/50 hover:border-border hover:text-muted-foreground'
                      )}
                    >
                      <span class="font-mono uppercase tracking-wider text-[10px] w-16 text-left">{bg}</span>
                      <span class="text-[10px] flex-1 text-left opacity-80 leading-tight">{BG_DESC[bg]}</span>
                      <CheckMark active={on} />
                    </button>
                  {/each}
                </div>
              </section>

              <!-- ARTIFACTS -->
              <section class="space-y-2 pt-1 border-t border-border/40">
                <header class="flex items-center justify-between pt-3">
                  <Label class="text-xs flex items-center gap-1.5">
                    <FileText class={cn('size-3', extrasActive ? 'text-blue-400' : 'text-muted-foreground/60')} />
                    Has artifacts
                  </Label>
                  {#if extrasActive}
                    <button type="button" onclick={() => resetSection('extras')} class="text-[10px] text-muted-foreground hover:text-foreground transition-colors">reset</button>
                  {/if}
                </header>
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-muted/40 transition-colors">
                    <Label for="f-report" class="text-xs cursor-pointer flex items-center gap-2 flex-1">
                      <FileText class="size-3.5 text-muted-foreground/70" />
                      <div>
                        <div>Has deep evaluation report</div>
                        <div class="text-[10px] text-muted-foreground/60">Claude oferta has been run</div>
                      </div>
                    </Label>
                    <Switch id="f-report" checked={filter.hasReport} onCheckedChange={(v: boolean) => (filter = { ...filter, hasReport: !!v })} />
                  </div>
                  <div class="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-muted/40 transition-colors">
                    <Label for="f-pdf" class="text-xs cursor-pointer flex items-center gap-2 flex-1">
                      <FileBadge2 class="size-3.5 text-muted-foreground/70" />
                      <div>
                        <div>Has tailored CV PDF</div>
                        <div class="text-[10px] text-muted-foreground/60">Ready to send</div>
                      </div>
                    </Label>
                    <Switch id="f-pdf" checked={filter.hasPdf} onCheckedChange={(v: boolean) => (filter = { ...filter, hasPdf: !!v })} />
                  </div>
                  <div class="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-muted/40 transition-colors">
                    <Label for="f-salary" class="text-xs cursor-pointer flex items-center gap-2 flex-1">
                      <DollarSign class="size-3.5 text-muted-foreground/70" />
                      <div>
                        <div>Has salary disclosed</div>
                        <div class="text-[10px] text-muted-foreground/60">Comp range parsed from posting</div>
                      </div>
                    </Label>
                    <Switch id="f-salary" checked={filter.hasSalary} onCheckedChange={(v: boolean) => (filter = { ...filter, hasSalary: !!v })} />
                  </div>
                </div>
              </section>
            </div>
          </Popover.Content>
        </Popover.Root>

        <!-- SORT -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="sm" class="h-8 gap-1.5 text-xs">
                <ArrowDownUp class="size-3.5" />
                <span class="hidden sm:inline text-muted-foreground">Sort:</span>
                <span class="text-foreground">{sortShort}</span>
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="bottom" align="end" class="w-72">
            <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Sort by</DropdownMenu.Label>
            {#each SORTS as s}
              {@const Icon = s.icon}
              <DropdownMenu.Item
                onSelect={() => (sort = s.key)}
                closeOnSelect={false}
                class="gap-2 items-start py-1.5"
              >
                <Icon class="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{s.label}</div>
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{s.desc}</div>
                </div>
                <CheckMark active={sort === s.key} class="mt-0.5" />
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- VIEW MODE -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              {@const ActiveIcon = activeView.icon}
              <Button {...props} variant="ghost" size="sm" class="h-8 gap-1.5 text-xs">
                <ActiveIcon class="size-3.5" />
                <span class="hidden sm:inline text-muted-foreground">View:</span>
                <span class="text-foreground">{activeView.label}</span>
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="bottom" align="end" class="w-64">
            <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">View as</DropdownMenu.Label>
            {#each VIEWS as v}
              {@const VIcon = v.icon}
              <DropdownMenu.Item
                onSelect={() => (viewMode = v.key)}
                closeOnSelect={false}
                class="gap-2 items-start py-1.5"
              >
                <VIcon class="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{v.label}</div>
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{v.desc}</div>
                </div>
                <CheckMark active={viewMode === v.key} class="mt-0.5" />
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  {/if}
</div>
