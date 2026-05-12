<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import {
    Search,
    Copy,
    Check,
    BookOpen,
    Send,
    Inbox,
    Sparkles,
    Target,
    Mic,
    FileText,
    Cog,
    X,
    ExternalLink,
    ChevronRight,
  } from '@lucide/svelte';
  import { renderMarkdown } from '$lib/client/safe-markdown';
  import { toast } from 'svelte-sonner';
  import { api, ApiError } from '$lib/api';
  import { cn, withMinDuration } from '$lib/utils';
  import type { Skill, SkillCategory } from '$lib/server/skills';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let { data }: { data: { skills: Skill[] } } = $props();

  // svelte-ignore state_referenced_locally — server data seeds local state.
  let allSkills = data.skills;

  type CategoryFilter = 'all' | SkillCategory;
  let activeCategory = $state<CategoryFilter>('all');
  let search = $state('');

  type CategoryDef = { id: CategoryFilter; label: string; icon: any; tint: string };
  const CATEGORIES: CategoryDef[] = [
    { id: 'all', label: 'All', icon: BookOpen, tint: 'border-foreground' },
    { id: 'evaluation', label: 'Evaluation', icon: Target, tint: 'border-emerald-500/60' },
    { id: 'application', label: 'Apply', icon: Send, tint: 'border-violet-500/60' },
    { id: 'pipeline', label: 'Pipeline', icon: Inbox, tint: 'border-blue-500/60' },
    { id: 'interview', label: 'Interview', icon: Mic, tint: 'border-amber-500/60' },
    { id: 'output', label: 'Output', icon: FileText, tint: 'border-cyan-500/60' },
  ];

  const CATEGORY_DOT: Record<SkillCategory, string> = {
    evaluation: 'bg-emerald-500',
    application: 'bg-violet-500',
    pipeline: 'bg-blue-500',
    interview: 'bg-amber-500',
    output: 'bg-cyan-500',
    system: 'bg-zinc-500',
  };
  const CATEGORY_LABEL: Record<SkillCategory, string> = {
    evaluation: 'Evaluation',
    application: 'Apply',
    pipeline: 'Pipeline',
    interview: 'Interview',
    output: 'Output',
    system: 'System',
  };

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return allSkills.filter((s) => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  });

  let grouped = $derived.by(() => {
    const out: Record<SkillCategory, Skill[]> = {
      evaluation: [],
      application: [],
      pipeline: [],
      interview: [],
      output: [],
      system: [],
    };
    for (const s of filtered) out[s.category].push(s);
    return out;
  });

  let countsByCategory = $derived.by(() => {
    const out: Record<string, number> = { all: allSkills.length };
    for (const s of allSkills) out[s.category] = (out[s.category] ?? 0) + 1;
    return out;
  });

  // ---- detail sheet state ----
  let openSkill = $state<Skill | null>(null);
  let bodyText = $state<string | null>(null);
  let bodyHtml = $derived(renderMarkdown(bodyText));
  let bodyLoading = $state(false);

  async function openSheet(s: Skill) {
    openSkill = s;
    bodyText = null;
    bodyLoading = true;
    try {
      const r = await withMinDuration(
        api.get<{ id: string; body: string }>('/api/skills/' + encodeURIComponent(s.id), {
          silent: true,
        }),
        300,
      );
      bodyText = r.body;
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to load skill: ' + err.message);
      bodyText = '';
    } finally {
      bodyLoading = false;
    }
  }

  let copiedKey = $state<string | null>(null);
  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = null;
      }, 1500);
      toast.success('Copied', { description: text.length > 60 ? text.slice(0, 60) + '…' : text });
    } catch (e) {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  // Order categories the way they appear in CATEGORIES (skip 'all')
  const CATEGORY_ORDER: SkillCategory[] = [
    'evaluation',
    'application',
    'pipeline',
    'interview',
    'output',
    'system',
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Skills" subtitle="{allSkills.length} available" showTabs={false} />

  <div class="p-6">
    <div class="max-w-6xl mx-auto space-y-5">
      <!-- Header / intro -->
      <div class="space-y-1.5 max-w-3xl">
        <h1 class="text-xl font-semibold tracking-tight">Agent skills</h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Each skill is a Claude Code slash-command that pairs a structured prompt with the data
          this dashboard maintains (CV, profile, pipeline, reports). Click a skill to read what it
          does, then copy the invocation to run it in your terminal.
        </p>
      </div>

      <!-- Search + category filter -->
      <div class="flex flex-col gap-3">
        <div class="relative max-w-sm">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
          />
          <Input bind:value={search} placeholder="Search skills…" class="h-9 pl-8 text-sm" />
          {#if search}
            <button
              onclick={() => (search = '')}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X class="size-3.5" />
            </button>
          {/if}
        </div>

        <div class="flex flex-wrap gap-1">
          {#each CATEGORIES as cat}
            {@const CIcon = cat.icon}
            {@const count = countsByCategory[cat.id] ?? 0}
            {@const active = activeCategory === cat.id}
            <button
              type="button"
              onclick={() => (activeCategory = cat.id)}
              class={cn(
                'inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-full border transition-colors',
                active
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground',
              )}
            >
              <CIcon class="size-3" />
              <span>{cat.label}</span>
              <span
                class={cn(
                  'text-[10px] tabular-nums',
                  active ? 'opacity-70' : 'text-muted-foreground/60',
                )}>{count}</span
              >
            </button>
          {/each}
        </div>
      </div>

      {#if filtered.length === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={Search}
          title="No skills match"
          description="Try a different search term or pick a different category above."
        />
      {:else}
        <!-- Sections per category, in a stable order -->
        <div class="space-y-7">
          {#each CATEGORY_ORDER as cat}
            {@const items = grouped[cat]}
            {#if items.length > 0}
              <section class="space-y-2.5">
                <div class="flex items-center gap-2">
                  <span class={cn('size-1.5 rounded-full', CATEGORY_DOT[cat])}></span>
                  <h2
                    class="text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase"
                  >
                    {CATEGORY_LABEL[cat]}
                  </h2>
                  <span class="text-[10px] text-muted-foreground/60 tabular-nums"
                    >{items.length}</span
                  >
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {#each items as s (s.id)}
                    <button
                      type="button"
                      onclick={() => openSheet(s)}
                      class="text-left group/skill"
                    >
                      <Card.Root
                        class="h-full hover:bg-accent/40 hover:border-accent/60 transition-colors"
                      >
                        <Card.Header class="pb-2">
                          <div class="flex items-start gap-3">
                            <div
                              class="size-9 rounded-lg bg-muted/40 flex items-center justify-center text-base flex-shrink-0"
                            >
                              {s.emoji}
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 flex-wrap">
                                <Card.Title class="text-sm font-mono">{s.title}</Card.Title>
                                {#if s.language === 'es'}
                                  <span
                                    class="text-[9px] font-mono uppercase text-muted-foreground/70 tracking-wider"
                                    >es</span
                                  >
                                {/if}
                              </div>
                              {#if s.subtitle}
                                <Card.Description class="text-xs mt-0.5 leading-snug"
                                  >{s.subtitle}</Card.Description
                                >
                              {/if}
                            </div>
                            <ChevronRight
                              class="size-3.5 text-muted-foreground/30 group-hover/skill:text-muted-foreground transition-colors flex-shrink-0 mt-1"
                            />
                          </div>
                        </Card.Header>
                        <Card.Content class="pb-3 pt-0">
                          {#if s.description}
                            <p
                              class="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed"
                            >
                              {s.description}
                            </p>
                          {/if}
                          <div class="flex items-center gap-2 mt-2">
                            <code class="text-[10px] font-mono text-muted-foreground/70 truncate"
                              >{s.invocation}</code
                            >
                          </div>
                        </Card.Content>
                      </Card.Root>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}
          {/each}
        </div>
      {/if}

      <p class="text-[10px] text-muted-foreground/50 text-center pt-4">
        Skills live as markdown files in <code class="font-mono">modes/</code>. Edit any of them to
        customize the prompt; the dashboard hot-reloads on next page load.
      </p>
    </div>
  </div>
</div>

<!-- Detail sheet -->
<Sheet.Root
  open={openSkill != null}
  onOpenChange={(v: boolean) => {
    if (!v) openSkill = null;
  }}
>
  <Sheet.Content side="right" class="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
    {#if openSkill}
      {@const s = openSkill}
      <Sheet.Header class="px-6 pt-6 pb-4 border-b">
        <div class="flex items-start gap-3">
          <div
            class="size-12 rounded-xl bg-muted ring-1 ring-border/40 flex items-center justify-center text-2xl flex-shrink-0"
          >
            {s.emoji}
          </div>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-base font-mono">{s.title}</Sheet.Title>
            {#if s.subtitle}
              <Sheet.Description class="text-sm mt-0.5">{s.subtitle}</Sheet.Description>
            {/if}
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <span
                class={cn(
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium',
                )}
              >
                <span class={cn('size-1.5 rounded-full', CATEGORY_DOT[s.category])}></span>
                <span class="text-muted-foreground">{CATEGORY_LABEL[s.category]}</span>
              </span>
              <span class="text-[10px] text-muted-foreground/60">·</span>
              <span class="text-[10px] text-muted-foreground/60 tabular-nums"
                >{(s.bytes / 1024).toFixed(1)} KB</span
              >
              {#if s.language === 'es'}
                <span class="text-[10px] text-muted-foreground/60">·</span>
                <span class="text-[10px] text-muted-foreground/70 font-mono uppercase">Spanish</span
                >
              {/if}
            </div>
          </div>
        </div>
      </Sheet.Header>

      <div class="px-6 py-4 border-b space-y-4">
        <!-- Run this skill — large, prominent block -->
        <div class="space-y-2">
          <div class="flex items-baseline justify-between gap-2">
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              Run this skill
            </div>
            <span class="text-[10px] text-muted-foreground/60"
              >⌘ + paste in Claude Code, or terminal</span
            >
          </div>
          <div class="relative rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-3">
              <span class="text-emerald-400/80 text-xs font-mono">›</span>
              <code
                class="flex-1 text-sm font-mono overflow-x-auto whitespace-nowrap text-foreground"
                >{s.invocation}</code
              >
              <Button
                variant="ghost"
                size="sm"
                class="h-7 gap-1.5 flex-shrink-0 text-xs"
                onclick={() => copyText(s.invocation, 'inv')}
              >
                {#if copiedKey === 'inv'}
                  <Check class="size-3 text-emerald-400" /> Copied
                {:else}
                  <Copy class="size-3" /> Copy
                {/if}
              </Button>
            </div>
            <div
              class="px-3 py-1.5 border-t border-border/40 bg-card/40 flex items-center gap-2 text-[10px] text-muted-foreground/80"
            >
              <span>From terminal:</span>
              <code class="font-mono text-foreground/80">claude {s.id}</code>
              <Button
                variant="ghost"
                size="icon"
                class="size-5 ml-auto"
                onclick={() => copyText('claude ' + s.id, 'cli')}
                aria-label="Copy CLI command"
              >
                {#if copiedKey === 'cli'}
                  <Check class="size-3 text-emerald-400" />
                {:else}
                  <Copy class="size-3" />
                {/if}
              </Button>
            </div>
          </div>
        </div>

        {#if s.inputs && s.inputs.length > 0}
          <div>
            <div
              class="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1.5"
            >
              Inputs you'll be asked for
            </div>
            <ul class="space-y-1">
              {#each s.inputs as inp}
                <li class="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span class="text-muted-foreground/40">·</span>
                  <span>{inp}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        {#if bodyLoading && !bodyText}
          <div class="space-y-2">
            {#each Array(8) as _}
              <div class="h-3 rounded bg-muted animate-pulse"></div>
            {/each}
          </div>
        {:else if bodyText}
          <div
            class="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-base prose-h1:mt-0 prose-h2:text-sm prose-h3:text-xs prose-p:text-xs prose-p:leading-relaxed prose-li:text-xs prose-li:my-0.5 prose-code:text-[11px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:text-[11px] prose-pre:bg-muted prose-table:text-xs prose-th:text-xs prose-td:text-xs prose-blockquote:text-xs prose-blockquote:text-muted-foreground prose-strong:text-foreground"
          >
            {@html bodyHtml}
          </div>
        {/if}
      </div>

      <div class="px-6 py-3 border-t flex items-center justify-between bg-muted/20">
        <div class="text-[10px] text-muted-foreground/70 font-mono truncate">
          modes/{s.id}.md
        </div>
        <Button
          variant="outline"
          size="sm"
          class="h-7 text-xs gap-1.5"
          onclick={() => copyText('modes/' + s.id + '.md', 'path')}
        >
          {#if copiedKey === 'path'}
            <Check class="size-3 text-emerald-400" /> Copied
          {:else}
            <Copy class="size-3" /> Copy path
          {/if}
        </Button>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
