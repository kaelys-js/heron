<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import Stepper from '$lib/components/Stepper.svelte';
  import {
    FolderKanban, Plus, MoreHorizontal, Pencil, Copy, Trash2, ArrowRight, Sparkles,
    Search, X, Target, AlertCircle, Briefcase, Building2,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll, goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';
  import { DEFAULT_FILTER, type BgRisk, type FilterState } from '$lib/types';
  import type { Project, ProjectColor, ProjectStats } from '$lib/server/projects';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  let { data }: {
    data: {
      projects: Project[];
      stats: Record<string, ProjectStats>;
      starters: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>[];
      totalJobs: number;
    };
  } = $props();

  const COLORS: ProjectColor[] = ['emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink'];

  const COLOR_BG: Record<ProjectColor, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
  };
  const COLOR_TINT: Record<ProjectColor, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    orange: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    pink: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
  };
  const COLOR_BORDER_L: Record<ProjectColor, string> = {
    emerald: 'border-l-emerald-500',
    blue: 'border-l-blue-500',
    violet: 'border-l-violet-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
    cyan: 'border-l-cyan-500',
    orange: 'border-l-orange-500',
    pink: 'border-l-pink-500',
  };

  type EditorMode = 'create' | 'edit';
  let editorOpen = $state(false);
  let editorMode = $state<EditorMode>('create');
  let editorBusy = $state(false);
  let editor = $state<Project>(blankProject());

  // ---- Live preview: how many jobs match the filter as the user edits ----
  type PreviewStats = { total: number; ready: number; applied: number; interview: number; offer: number; topScore: number | null };
  let preview = $state<PreviewStats | null>(null);
  let previewLoading = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!editorOpen) {
      preview = null;
      return;
    }
    // capture filter snapshot to retrigger on changes
    const _ = JSON.stringify(editor.filter);
    if (previewTimer) clearTimeout(previewTimer);
    previewLoading = true;
    previewTimer = setTimeout(async () => {
      try {
        const r = await api.post<PreviewStats & { ok: boolean }>(
          '/api/projects/preview',
          { filter: editor.filter },
          { silent: true },
        );
        preview = { total: r.total, ready: r.ready, applied: r.applied, interview: r.interview, offer: r.offer, topScore: r.topScore };
      } catch {
        preview = null;
      } finally {
        previewLoading = false;
      }
    }, 250);
  });

  function blankProject(): Project {
    const now = Date.now();
    return {
      id: '',
      name: '',
      description: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      filter: { ...DEFAULT_FILTER, bgRisk: { ...DEFAULT_FILTER.bgRisk } },
      target: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  function openCreate(seed?: Partial<Project>) {
    editorMode = 'create';
    editor = {
      ...blankProject(),
      ...seed,
      filter: seed?.filter
        ? { ...seed.filter, bgRisk: { ...seed.filter.bgRisk } }
        : blankProject().filter,
    };
    editorOpen = true;
  }

  function openEdit(p: Project) {
    editorMode = 'edit';
    editor = { ...p, filter: { ...p.filter, bgRisk: { ...p.filter.bgRisk } } };
    editorOpen = true;
  }

  let canSave = $derived(editor.name.trim().length > 0);

  async function saveEditor() {
    if (!canSave || editorBusy) return;
    editorBusy = true;
    try {
      const payload: Partial<Project> = {
        name: editor.name,
        description: editor.description,
        color: editor.color,
        filter: editor.filter,
        target: editor.target,
      };
      if (editorMode === 'create') {
        await withMinDuration(
          api.post<{ project: Project }>('/api/projects', payload, { silent: true }),
          400,
        );
        toast.success('Project created', { description: editor.name });
      } else {
        await withMinDuration(
          api.put<{ project: Project }>('/api/projects/' + encodeURIComponent(editor.id), payload, { silent: true }),
          400,
        );
        toast.success('Project saved');
      }
      editorOpen = false;
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to save project', { description: err.message });
    } finally {
      editorBusy = false;
    }
  }

  // ---- delete with double-click confirmation (shared ConfirmGate) ----
  const confirmDelete = new ConfirmGate();
  onDestroy(() => confirmDelete.destroy());
  async function onDeleteClick(p: Project, e: Event) {
    e.preventDefault();
    if (!confirmDelete.trigger('delete:' + p.id)) return;
    try {
      await withMinDuration(api.delete('/api/projects/' + encodeURIComponent(p.id), { silent: true }), 400);
      toast.success('Project deleted', { description: p.name });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to delete', { description: err.message });
    }
  }

  async function duplicateProject(p: Project) {
    try {
      await withMinDuration(
        api.post<{ project: Project }>(
          '/api/projects',
          {
            name: p.name + ' (copy)',
            description: p.description,
            color: p.color,
            filter: { ...p.filter, bgRisk: { ...p.filter.bgRisk } },
            target: p.target,
          },
          { silent: true },
        ),
        400,
      );
      toast.success('Duplicated', { description: p.name });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to duplicate', { description: err.message });
    }
  }

  // ---- "Open in Pipeline" — build URL params and navigate ----
  function projectUrl(p: Project): string {
    const params = new URLSearchParams();
    params.set('from', 'project:' + p.id);
    if (p.filter.minScore > 0) params.set('score', String(p.filter.minScore));
    const bg = (Object.entries(p.filter.bgRisk) as [NonNullable<BgRisk>, boolean][])
      .filter(([, on]) => on).map(([k]) => k);
    const isDefault = bg.length === 3 && !bg.includes('BLOCKED');
    if (!isDefault) params.set('bg', bg.join(','));
    if (p.filter.hasPdf) params.set('pdf', '1');
    if (p.filter.hasReport) params.set('report', '1');
    if (p.filter.search.trim()) params.set('search', p.filter.search.trim());
    const qs = params.toString();
    return '/pipeline' + (qs ? '?' + qs : '');
  }

  async function openInPipeline(p: Project) {
    await goto(projectUrl(p));
  }

  // ---- editor — filter helpers ----
  const SCORE_TIERS = [
    { label: 'Any', value: 0 },
    { label: '3+',  value: 3 },
    { label: '4+',  value: 4 },
    { label: '4.5+', value: 4.5 },
  ];
  const BG_KEYS: NonNullable<BgRisk>[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKED'];

  function setMinScore(v: number) {
    editor = { ...editor, filter: { ...editor.filter, minScore: v } };
  }
  function toggleBg(k: NonNullable<BgRisk>) {
    editor = { ...editor, filter: { ...editor.filter, bgRisk: { ...editor.filter.bgRisk, [k]: !editor.filter.bgRisk[k] } } };
  }

  // Derived per-project chips for compact display
  function filterChips(p: Project): string[] {
    const chips: string[] = [];
    const f = p.filter;
    if (f.minScore > 0) chips.push('Score ≥ ' + (Number.isInteger(f.minScore) ? f.minScore.toFixed(0) : f.minScore.toFixed(1)));
    const bgOn = (Object.entries(f.bgRisk) as [NonNullable<BgRisk>, boolean][]).filter(([, on]) => on).map(([k]) => k);
    if (bgOn.length === 1) chips.push('BG ' + bgOn[0]);
    else if (bgOn.length === 2) chips.push('BG ' + bgOn.join('+'));
    else if (bgOn.length === 3 && !bgOn.includes('BLOCKED')) { /* default, skip */ }
    else if (bgOn.length === 4) chips.push('BG any');
    if (f.hasReport) chips.push('Has report');
    if (f.hasPdf) chips.push('Has PDF');
    if (f.search.trim()) chips.push('"' + f.search.trim() + '"');
    return chips;
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Projects"
    subtitle={data.projects.length === 0 ? 'no projects yet' : data.projects.length + ' saved'}
    showTabs={false}
  />

  <div class="p-6">
    <div class="max-w-5xl mx-auto space-y-5">
      <!-- Header / intro -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="space-y-1.5 max-w-2xl">
          <h1 class="text-xl font-semibold tracking-tight">Saved filter profiles</h1>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Each project bundles a filter — score, background-check risk, search text, "has report" flags — into a named view.
            Open a project to see the matching slice of your pipeline; track an application target per project to keep
            parallel job-hunting tracks moving forward.
          </p>
        </div>
        {#if data.projects.length > 0}
          <Button onclick={() => openCreate()} class="h-9 gap-1.5">
            <Plus class="size-4" />
            New project
          </Button>
        {/if}
      </div>

      {#if data.projects.length === 0}
        <!-- Empty state with starter templates -->
        <Card.Root class="border-dashed">
          <Card.Content class="p-8 flex flex-col items-center text-center gap-3">
            <div class="size-12 rounded-xl bg-muted flex items-center justify-center">
              <FolderKanban class="size-6 text-muted-foreground" />
            </div>
            <h2 class="text-base font-semibold">Start with a project</h2>
            <p class="text-xs text-muted-foreground max-w-md leading-relaxed">
              Try one of these starter templates — each one is a useful slice of {data.totalJobs.toLocaleString()} jobs in your pipeline.
              You can edit, rename, or delete them later.
            </p>
          </Card.Content>
        </Card.Root>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each data.starters as starter}
            <Card.Root class={cn('border-l-2 transition-colors hover:bg-accent/30', COLOR_BORDER_L[starter.color])}>
              <Card.Header class="pb-3">
                <div class="flex items-start gap-3">
                  <div class={cn('size-9 rounded-lg flex items-center justify-center ring-1 flex-shrink-0', COLOR_TINT[starter.color])}>
                    <Sparkles class="size-4" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <Card.Title class="text-sm">{starter.name}</Card.Title>
                    <Card.Description class="text-xs mt-1 leading-relaxed">{starter.description}</Card.Description>
                  </div>
                </div>
              </Card.Header>
              <Card.Content class="pt-0 pb-4">
                <Button variant="outline" size="sm" class="w-full h-8 gap-1.5" onclick={() => openCreate(starter as Partial<Project>)}>
                  <Plus class="size-3.5" /> Use this template
                </Button>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>

        <div class="flex items-center justify-center pt-2">
          <Button variant="ghost" size="sm" class="gap-1.5" onclick={() => openCreate()}>
            <Plus class="size-3.5" /> Create from scratch
          </Button>
        </div>
      {:else}
        <!-- Project grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each data.projects as p (p.id)}
            {@const stats = data.stats[p.id]}
            {@const chips = filterChips(p)}
            {@const armed = confirmDelete.isArmed('delete:' + p.id)}
            {@const progress = p.target > 0 ? Math.min(100, (stats.applied / p.target) * 100) : null}
            <Card.Root class={cn('border-l-2 overflow-hidden flex flex-col transition-colors hover:border-accent/60', COLOR_BORDER_L[p.color])}>
              <Card.Header class="pb-3">
                <div class="flex items-start gap-2">
                  <div class={cn('size-7 rounded-md flex items-center justify-center ring-1 flex-shrink-0 text-[11px] font-mono uppercase font-semibold', COLOR_TINT[p.color])}>
                    {p.name.slice(0, 2)}
                  </div>
                  <div class="flex-1 min-w-0">
                    <Card.Title class="text-sm leading-tight overflow-hidden whitespace-nowrap">{p.name}</Card.Title>
                    <div class="text-[10px] text-muted-foreground mt-0.5">Updated {formatRelativeTime(p.updatedAt)}</div>
                  </div>
                  <DropdownMenu.Root>
                    <Tooltip.Provider delayDuration={250}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props: tipProps })}
                            <DropdownMenu.Trigger>
                              {#snippet child({ props: ddProps })}
                                <Button {...tipProps} {...ddProps} variant="ghost" size="icon" class="size-7 -mr-1 -mt-1 flex-shrink-0" aria-label="Project actions">
                                  <MoreHorizontal class="size-3.5" />
                                </Button>
                              {/snippet}
                            </DropdownMenu.Trigger>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="left" class="text-xs">Edit, duplicate, or delete</Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                    <DropdownMenu.Content side="bottom" align="end" class="w-44">
                      <DropdownMenu.Item onSelect={() => openEdit(p)} class="gap-2">
                        <Pencil class="size-3.5" /> Edit
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => duplicateProject(p)} class="gap-2">
                        <Copy class="size-3.5" /> Duplicate
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        onSelect={(e: Event) => onDeleteClick(p, e)}
                        closeOnSelect={false}
                        class={cn(
                          'gap-2',
                          armed
                            ? 'bg-red-500/15 text-red-400 focus:bg-red-500/20 focus:text-red-300 animate-pulse'
                            : 'text-red-400 focus:bg-red-500/10 focus:text-red-300'
                        )}
                      >
                        <Trash2 class="size-3.5" />
                        <span class="flex-1">{armed ? 'Click again to confirm delete' : 'Delete'}</span>
                        {#if armed}<span class="text-[10px] font-mono opacity-70">3s</span>{/if}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </Card.Header>
              <Card.Content class="space-y-3 pt-0 flex-1 flex flex-col">
                {#if p.description}
                  <p class="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.description}</p>
                {/if}

                {#if chips.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each chips as c}
                      <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">{c}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 border border-border/40 self-start">No filters</span>
                {/if}

                <!-- Stats grid -->
                <div class="grid grid-cols-4 gap-2 pt-1">
                  <div class="text-center">
                    <div class="text-base font-semibold tabular-nums">{stats.total}</div>
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">Match</div>
                  </div>
                  <div class="text-center">
                    <div class="text-base font-semibold tabular-nums {stats.applied > 0 ? 'text-violet-300' : 'text-muted-foreground/40'}">{stats.applied}</div>
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">Applied</div>
                  </div>
                  <div class="text-center">
                    <div class="text-base font-semibold tabular-nums {stats.interview > 0 ? 'text-orange-300' : 'text-muted-foreground/40'}">{stats.interview}</div>
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">Itvw+</div>
                  </div>
                  <div class="text-center">
                    <div class="text-base font-semibold tabular-nums {stats.offer > 0 ? 'text-emerald-300' : 'text-muted-foreground/40'}">{stats.offer}</div>
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">Offer</div>
                  </div>
                </div>

                {#if progress != null}
                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="text-muted-foreground flex items-center gap-1">
                        <Target class="size-2.5" /> Target
                      </span>
                      <span class="text-muted-foreground tabular-nums">{stats.applied}/{p.target} applied</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        class={cn('h-full transition-all', COLOR_BG[p.color])}
                        style={'width: ' + progress + '%'}
                      ></div>
                    </div>
                  </div>
                {/if}

                {#if stats.topCompanies.length > 0}
                  <div class="text-[10px] text-muted-foreground/80 leading-relaxed">
                    <span class="text-muted-foreground/60">Top: </span>
                    {stats.topCompanies.slice(0, 3).map((c) => c.name + ' (' + c.count + ')').join(' · ')}
                  </div>
                {/if}

                <div class="flex-1"></div>

                <Button
                  variant="outline"
                  size="sm"
                  class="w-full h-8 gap-1.5 mt-auto"
                  disabled={stats.total === 0}
                  onclick={() => openInPipeline(p)}
                >
                  <ArrowRight class="size-3.5" />
                  {stats.total === 0 ? 'No matching jobs' : 'Open in Pipeline'}
                </Button>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Create / Edit sheet -->
<Sheet.Root open={editorOpen} onOpenChange={(v: boolean) => (editorOpen = v)}>
  <Sheet.Content side="right" class="w-full sm:max-w-lg flex flex-col p-0 gap-0">
    <Sheet.Header class="px-6 pt-6 pb-4 border-b">
      <div class="flex items-start gap-3">
        <div class={cn('size-9 rounded-lg ring-1 flex items-center justify-center flex-shrink-0', COLOR_TINT[editor.color])}>
          <FolderKanban class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <Sheet.Title>{editorMode === 'create' ? 'New project' : 'Edit project'}</Sheet.Title>
          <Sheet.Description class="text-xs mt-0.5">
            {editorMode === 'create'
              ? 'Save a filter as a named track. Watch the match count update as you tune the criteria.'
              : 'Update the filter, target, or appearance. Stats refresh after saving.'}
          </Sheet.Description>
        </div>
      </div>
    </Sheet.Header>

    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">
      <!-- Identity -->
      <div class="space-y-3">
        <div class="space-y-1.5">
          <Label class="text-xs">Name <span class="text-red-400">*</span></Label>
          <Input
            bind:value={editor.name}
            placeholder="e.g. Vancouver Senior, Founding Engineer, AI Infra…"
            class="h-9"
          />
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">Description</Label>
          <Textarea
            bind:value={editor.description}
            placeholder="What this project tracks. One or two sentences."
            class="text-sm min-h-[60px]"
          />
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">Color</Label>
          <Tooltip.Provider delayDuration={250}>
            <div class="flex items-center gap-1.5 flex-wrap">
              {#each COLORS as c}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        type="button"
                        onclick={() => (editor = { ...editor, color: c })}
                        aria-label={'Color ' + c}
                        class={cn(
                          'size-7 rounded-md transition-all',
                          COLOR_BG[c],
                          editor.color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground' : 'opacity-70 hover:opacity-100'
                        )}
                      ></button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" class="text-xs capitalize">{c}{editor.color === c ? ' · selected' : ''}</Tooltip.Content>
                </Tooltip.Root>
              {/each}
            </div>
          </Tooltip.Provider>
        </div>
      </div>

      <!-- Filter -->
      <div class="space-y-3 pt-2 border-t">
        <div class="flex items-center gap-2">
          <Search class="size-3.5 text-muted-foreground" />
          <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filter criteria</h3>
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs">Minimum score</Label>
          <div class="inline-flex rounded-md border overflow-hidden">
            {#each SCORE_TIERS as tier, i}
              <button
                type="button"
                onclick={() => setMinScore(tier.value)}
                class={cn(
                  'h-8 px-3 text-xs font-medium transition-colors',
                  i > 0 && 'border-l',
                  editor.filter.minScore === tier.value
                    ? 'bg-foreground text-background'
                    : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >{tier.label}</button>
            {/each}
          </div>
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs">Background-check risk</Label>
          <div class="flex flex-wrap gap-1.5">
            {#each BG_KEYS as bg}
              {@const on = editor.filter.bgRisk[bg]}
              <button
                type="button"
                onclick={() => toggleBg(bg)}
                class={cn(
                  'h-7 px-2.5 text-[10px] font-mono uppercase rounded-md border transition-all',
                  on
                    ? bg === 'LOW' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : bg === 'MEDIUM' ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : bg === 'HIGH' ? 'bg-red-500/10 border-red-500/40 text-red-300'
                      : 'bg-red-700/30 border-red-500/60 text-red-200'
                    : 'bg-transparent border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground'
                )}
              >{bg}</button>
            {/each}
          </div>
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs">Company or role contains</Label>
          <div class="relative">
            <Input
              bind:value={editor.filter.search}
              placeholder="e.g. Vancouver, Cloudflare, Founding…"
              class="h-9 pr-7"
            />
            {#if editor.filter.search}
              <button
                onclick={() => (editor = { ...editor, filter: { ...editor.filter, search: '' } })}
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X class="size-3.5" />
              </button>
            {/if}
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div>
            <Label for="ed-report" class="text-xs cursor-pointer">Has deep evaluation report</Label>
            <p class="text-[10px] text-muted-foreground/70">Only jobs with a Claude eval in <code class="font-mono">reports/</code></p>
          </div>
          <Switch
            id="ed-report"
            checked={editor.filter.hasReport}
            onCheckedChange={(v: boolean) => (editor = { ...editor, filter: { ...editor.filter, hasReport: !!v } })}
          />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <Label for="ed-pdf" class="text-xs cursor-pointer">Has tailored CV PDF</Label>
            <p class="text-[10px] text-muted-foreground/70">Only jobs with a generated PDF in <code class="font-mono">output/</code></p>
          </div>
          <Switch
            id="ed-pdf"
            checked={editor.filter.hasPdf}
            onCheckedChange={(v: boolean) => (editor = { ...editor, filter: { ...editor.filter, hasPdf: !!v } })}
          />
        </div>
      </div>

      <!-- Target -->
      <div class="space-y-3 pt-2 border-t">
        <div class="flex items-center gap-2">
          <Target class="size-3.5 text-muted-foreground" />
          <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Application target</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
          <p class="text-xs text-muted-foreground leading-relaxed">
            How many applications do you want to send from this project? Set 0 to skip the target tracker.
          </p>
          <Stepper
            value={editor.target}
            onchange={(v) => (editor = { ...editor, target: v })}
            min={0}
            max={500}
            step={1}
            decimals={0}
            suffix=" goal"
            label="Target applications"
            class="w-32"
          />
        </div>
      </div>
    </div>

    <!-- Live preview panel: shows how many jobs match the current filter draft -->
    <div class="px-6 py-3 border-t bg-muted/30">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-baseline gap-2 min-w-0">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">Matches</span>
          <span class={cn(
            'text-xl font-mono tabular-nums transition-colors',
            previewLoading && 'opacity-60',
            preview && preview.total > 0 && 'text-foreground',
            preview && preview.total === 0 && 'text-amber-300/80',
          )}>
            {preview?.total ?? '—'}
          </span>
          <span class="text-[10px] text-muted-foreground">
            {preview?.total === 1 ? 'job' : 'jobs'} in your pipeline
          </span>
        </div>
        {#if preview && preview.total > 0}
          <div class="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
            {#if preview.topScore != null}
              <span>top <span class="text-emerald-300 font-medium">{preview.topScore.toFixed(1)}</span></span>
            {/if}
            {#if preview.ready > 0}
              <span>· <span class="text-emerald-300/90">{preview.ready} ready</span></span>
            {/if}
            {#if preview.applied > 0}
              <span>· <span class="text-violet-300/90">{preview.applied} applied</span></span>
            {/if}
            {#if preview.interview > 0}
              <span>· <span class="text-orange-300/90">{preview.interview} interviewing</span></span>
            {/if}
          </div>
        {:else if preview && preview.total === 0}
          <span class="text-[10px] text-amber-300/80">Filter is too narrow — no matches</span>
        {/if}
      </div>
    </div>

    <Sheet.Footer class="px-6 py-3 border-t">
      <Button variant="ghost" onclick={() => (editorOpen = false)} disabled={editorBusy}>Cancel</Button>
      <Button onclick={saveEditor} disabled={!canSave || editorBusy}>
        {editorBusy ? 'Saving…' : editorMode === 'create' ? 'Create project' : 'Save changes'}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
