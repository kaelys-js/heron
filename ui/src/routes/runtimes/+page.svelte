<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { toast } from 'svelte-sonner';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';
  import {
    Cpu,
    Box,
    Sparkles,
    Zap,
    Briefcase,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    XCircle,
    RotateCw,
    Loader2,
    ExternalLink,
    Activity,
    Wrench,
  } from '@lucide/svelte';
  import type { RuntimeCard, RuntimeStatus } from '$lib/server/runtime-info';

  let { data }: { data: { report: { generatedAt: number; summary: any; cards: RuntimeCard[] } } } =
    $props();

  const ICON_MAP: Record<string, any> = {
    node: Cpu,
    python: Box,
    anthropic: Sparkles,
    gemini: Zap,
    adzuna: Briefcase,
  };

  const STATUS_DOT: Record<RuntimeStatus, string> = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
    unconfigured: 'bg-zinc-500',
  };
  const STATUS_RING: Record<RuntimeStatus, string> = {
    healthy: 'ring-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    degraded: 'ring-amber-500/30 bg-amber-500/10 text-amber-300',
    down: 'ring-red-500/30 bg-red-500/10 text-red-300',
    unconfigured: 'ring-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  };
  const STATUS_BORDER: Record<RuntimeStatus, string> = {
    healthy: 'border-l-emerald-500/60',
    degraded: 'border-l-amber-500/60',
    down: 'border-l-red-500/60',
    unconfigured: 'border-l-zinc-700',
  };
  const STATUS_LABEL: Record<RuntimeStatus, string> = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    down: 'Not running',
    unconfigured: 'Not configured',
  };

  let probing = $state<Record<string, boolean>>({});
  let refreshing = $state(false);

  async function probeIntegration(cardId: string, provider: 'anthropic' | 'gemini' | 'adzuna') {
    if (probing[cardId]) return;
    probing = { ...probing, [cardId]: true };
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean; provider: string; message: string }>(
          '/api/settings/test',
          { provider },
          { silent: true },
        ),
        500,
      );
      if (r.ok) toast.success(provider + ': ' + r.message);
      else toast.error(provider + ': ' + r.message, { duration: 8_000 });
    } catch (e) {
      const err = e as ApiError;
      toast.error(provider + ': ' + err.message);
    } finally {
      probing = { ...probing, [cardId]: false };
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await withMinDuration(invalidateAll(), 450);
      toast.success('Refreshed', {
        description: 'All probes re-run · ' + formatRelativeTime(Date.now()),
        duration: 2_000,
      });
    } finally {
      refreshing = false;
    }
  }

  // Aggregate stats
  let stats = $derived.by(() => {
    const cards = data.report.cards;
    return {
      total: cards.length,
      required: cards.filter((c) => c.required).length,
      healthy: cards.filter((c) => c.status === 'healthy').length,
      issues: cards.filter((c) => c.status === 'degraded' || c.status === 'down').length,
      unconfigured: cards.filter((c) => c.status === 'unconfigured').length,
    };
  });
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Runtimes" showTabs={false} />
  <div class={cn('p-6 transition-opacity', refreshing && 'opacity-60')}>
    <div class="max-w-5xl mx-auto space-y-5">
      <!-- Hero / aggregate -->
      <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div class="space-y-1.5 max-w-2xl">
          <h1 class="text-xl font-semibold tracking-tight">System health</h1>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Every runtime and integration the pipeline depends on, with live status. The pipeline
            can run on Node + Python + Gemini alone — Claude and Adzuna are optional accelerators.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 self-start md:self-auto"
          disabled={refreshing}
          onclick={refresh}
        >
          {#if refreshing}
            <Loader2 class="size-3.5 animate-spin" />
            Refreshing…
          {:else}
            <RotateCw class="size-3.5" />
            Refresh
          {/if}
        </Button>
      </div>

      <!-- Stat strip -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div class="flex items-center gap-2">
            <CheckCircle2 class="size-4 text-emerald-400" />
            <span class="text-[11px] uppercase tracking-wide text-emerald-300/80 font-medium"
              >Healthy</span
            >
          </div>
          <div class="text-2xl font-mono tabular-nums mt-1 text-emerald-200">{stats.healthy}</div>
          <div class="text-[10px] text-muted-foreground">of {stats.total} components</div>
        </div>
        <div
          class={cn(
            'rounded-lg border px-4 py-3',
            stats.issues > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border/40 bg-card',
          )}
        >
          <div class="flex items-center gap-2">
            <AlertTriangle
              class={cn('size-4', stats.issues > 0 ? 'text-red-400' : 'text-muted-foreground/50')}
            />
            <span
              class={cn(
                'text-[11px] uppercase tracking-wide font-medium',
                stats.issues > 0 ? 'text-red-300/80' : 'text-muted-foreground/70',
              )}>Issues</span
            >
          </div>
          <div
            class={cn(
              'text-2xl font-mono tabular-nums mt-1',
              stats.issues > 0 ? 'text-red-200' : 'text-muted-foreground',
            )}
          >
            {stats.issues}
          </div>
          <div class="text-[10px] text-muted-foreground">degraded or down</div>
        </div>
        <div class="rounded-lg border border-zinc-500/30 bg-zinc-500/5 px-4 py-3">
          <div class="flex items-center gap-2">
            <XCircle class="size-4 text-zinc-400" />
            <span class="text-[11px] uppercase tracking-wide text-zinc-300/80 font-medium"
              >Not set up</span
            >
          </div>
          <div class="text-2xl font-mono tabular-nums mt-1 text-zinc-200">{stats.unconfigured}</div>
          <div class="text-[10px] text-muted-foreground">awaiting config</div>
        </div>
        <div class="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
          <div class="flex items-center gap-2">
            <Activity
              class={cn(
                'size-4 text-blue-400',
                data.report.summary.runningTasks.length > 0 && 'animate-pulse',
              )}
            />
            <span class="text-[11px] uppercase tracking-wide text-blue-300/80 font-medium"
              >Running</span
            >
          </div>
          <div class="text-2xl font-mono tabular-nums mt-1 text-blue-200">
            {data.report.summary.runningTasks.length}
          </div>
          <div class="text-[10px] text-muted-foreground overflow-hidden whitespace-nowrap">
            {data.report.summary.runningTasks.length === 0
              ? 'no active tasks'
              : data.report.summary.runningTasks.join(' · ')}
          </div>
        </div>
      </div>

      <!-- Runtime cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each data.report.cards as c}
          {@const Icon = ICON_MAP[c.id] ?? Wrench}
          <Card.Root
            class={cn('overflow-hidden border-l-2 transition-colors', STATUS_BORDER[c.status])}
          >
            <Card.Header class="pb-3">
              <div class="flex items-start gap-3">
                <div
                  class={cn(
                    'size-9 rounded-lg flex items-center justify-center ring-1 flex-shrink-0',
                    STATUS_RING[c.status],
                  )}
                >
                  <Icon class="size-4" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <Card.Title class="text-sm leading-tight">{c.name}</Card.Title>
                    {#if c.required}
                      <span class="text-[10px] font-medium text-red-400/90 uppercase tracking-wide"
                        >required</span
                      >
                    {:else}
                      <span
                        class="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide"
                        >optional</span
                      >
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class={'size-1.5 rounded-full ' + STATUS_DOT[c.status]}></span>
                    <span class="text-[11px] text-muted-foreground">{STATUS_LABEL[c.status]}</span>
                    {#if c.badge}
                      <span class="text-[11px] text-muted-foreground/60">·</span>
                      <span class="text-[11px] font-mono text-muted-foreground/80 truncate"
                        >{c.badge}</span
                      >
                    {/if}
                  </div>
                </div>
              </div>
            </Card.Header>
            <Card.Content class="space-y-3 pb-4">
              {#if c.details.length > 0}
                <div class="space-y-0.5">
                  {#each c.details as line}
                    <p class="text-[11px] text-muted-foreground leading-relaxed">{line}</p>
                  {/each}
                </div>
              {/if}

              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground/70">Powers</p>
                <ul class="text-xs space-y-0.5">
                  {#each c.powers as feature}
                    <li class="flex items-start gap-1.5">
                      <span class="text-muted-foreground/40 select-none">·</span>
                      <span class="text-muted-foreground">{feature}</span>
                    </li>
                  {/each}
                </ul>
              </div>

              {#if c.usage}
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                  <div class="text-xs">
                    <span class="font-mono tabular-nums text-foreground">{c.usage.last24h}</span>
                    <span class="text-muted-foreground"> calls · 24h</span>
                  </div>
                  <div class="text-[10px] text-muted-foreground">
                    {c.usage.lastUsedAt
                      ? 'last ' + formatRelativeTime(c.usage.lastUsedAt)
                      : 'no recent calls'}
                  </div>
                </div>
                {#if c.usage.lastError}
                  <div
                    class="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded border border-red-500/30 bg-red-500/5 text-red-300"
                  >
                    <AlertTriangle class="size-3 mt-0.5 flex-shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium overflow-hidden whitespace-nowrap">
                        {c.usage.lastError.title}
                      </div>
                      {#if c.usage.lastError.message}
                        <div class="text-red-300/80 overflow-hidden whitespace-nowrap">
                          {c.usage.lastError.message}
                        </div>
                      {/if}
                      <div class="text-red-400/60 mt-0.5">
                        {formatRelativeTime(c.usage.lastError.ts)}
                      </div>
                    </div>
                  </div>
                {/if}
              {/if}

              <div class="flex items-center gap-2 pt-1">
                {#if c.probable && c.status === 'healthy'}
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs gap-1.5"
                    disabled={probing[c.id]}
                    onclick={() => probeIntegration(c.id, c.probable!)}
                  >
                    {#if probing[c.id]}
                      <Loader2 class="size-3 animate-spin" /> Testing…
                    {:else}
                      <RotateCw class="size-3" /> Test connection
                    {/if}
                  </Button>
                {/if}
                {#if c.status === 'unconfigured' && c.setupUrl}
                  <a
                    href={c.setupUrl}
                    class="inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <ExternalLink class="size-3" />
                    {c.setupLabel ?? 'Set up'}
                  </a>
                {/if}
                {#if c.status === 'down' || c.status === 'degraded'}
                  <span class="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle class="size-3" />
                    {c.status === 'down'
                      ? 'Action required to restore'
                      : 'Some features unavailable'}
                  </span>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        {/each}
      </div>

      <p class="text-[10px] text-muted-foreground/60 text-right">
        Generated {formatRelativeTime(data.report.generatedAt)}
      </p>
    </div>
  </div>
</div>
