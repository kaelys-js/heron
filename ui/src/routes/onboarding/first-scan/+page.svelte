<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import {
    Search,
    ArrowRight,
    ArrowLeft,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Play,
    Circle,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { onMount, onDestroy } from 'svelte';
  import { cn } from '$lib/utils';
  import type { ActivityEvent } from '$lib/types';

  let {
    data,
  }: {
    data: {
      children: { id: string; label: string; alwaysOn?: boolean; source?: string }[];
      profileId: string;
    };
  } = $props();
  let q = $derived('?profile=' + encodeURIComponent(data.profileId));

  type ChildStatus = 'pending' | 'running' | 'success' | 'error';

  // Track each child scanner's state. The keys are job ids matching the
  // `source` field of activity events. Initialised from props, which is fine
  // during $state() construction.
  // svelte-ignore state_referenced_locally -- initial seed only
  let statuses = $state<Record<string, { status: ChildStatus; message?: string; found?: number }>>(
    Object.fromEntries(data.children.map((c) => [c.id, { status: 'pending' as const }])),
  );

  let started = $state(false);
  let finished = $state(false);
  let scanAllFound = $state(0);
  let startedAt = $state<number | null>(null);
  let elapsedSec = $state(0);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let eventSource: EventSource | null = null;

  // Match an activity event to one of our child rows. Events come in with
  // source = the JobDef id (e.g. 'scan-portals', 'scan-linkedin-auth').
  function isChildEvent(ev: ActivityEvent): boolean {
    return data.children.some((c) => c.id === ev.source);
  }

  function applyEvent(ev: ActivityEvent): void {
    if (ev.source === 'scan-all') {
      // Top-level fan-out events.
      if (ev.title.includes('dispatched')) {
        // No state change -- children will report their own start events.
        return;
      }
      if (ev.title.includes('finished')) {
        finished = true;
        // Parse total from message: "{N} total · {breakdown}"
        const m = ev.message?.match(/^(\d+) total/);
        if (m) scanAllFound = Number(m[1]);
      }
      return;
    }
    if (!isChildEvent(ev)) return;
    const id = ev.source;
    const prev = statuses[id] ?? { status: 'pending' };
    if (ev.level === 'success') {
      // Try to extract a "Total jobs found: N" or "Found N" count from msg.
      const m = ev.message?.match(/(\d+)\s+(?:jobs?|new offers|total|found)/i);
      const found = m ? Number(m[1]) : prev.found;
      statuses = {
        ...statuses,
        [id]: { status: 'success', message: ev.message ?? ev.title, found },
      };
    } else if (ev.level === 'error') {
      statuses = { ...statuses, [id]: { status: 'error', message: ev.message ?? ev.title } };
    } else if (ev.level === 'warn') {
      // Treat warns like running unless we've already succeeded; surface the message.
      if (prev.status === 'success' || prev.status === 'error') return;
      statuses = { ...statuses, [id]: { status: 'running', message: ev.message ?? ev.title } };
    } else {
      // info -- running
      if (prev.status === 'success' || prev.status === 'error') return;
      statuses = { ...statuses, [id]: { status: 'running', message: ev.message ?? ev.title } };
    }
  }

  async function startScan() {
    if (started) return;
    started = true;
    startedAt = Date.now();
    elapsedTimer = setInterval(() => {
      if (startedAt) elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    }, 500);
    try {
      // Fire and forget -- the SSE stream tells us when each child finishes.
      // Pass profileId in the body so the scan-all fan-out targets this
      // profile only (not every profile in the system).
      await api.post(
        '/api/run',
        { task: 'scan-all', args: { profileId: data.profileId } },
        { silent: true },
      );
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not start scan', { description: err.message });
      started = false;
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    }
  }

  async function continueOn(action: 'complete' | 'skip') {
    try {
      await api.post('/api/onboarding/step', { step: 'first-scan', action }, { silent: true });
      await goto('/onboarding/done' + q);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not advance', { description: err.message });
    }
  }

  onMount(() => {
    eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as ActivityEvent;
        applyEvent(ev);
      } catch {
        // ignore
      }
    };
    eventSource.onerror = () => {
      // Browser EventSource auto-retries; nothing to do here.
    };
  });

  onDestroy(() => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  });

  function statusIcon(s: ChildStatus) {
    if (s === 'pending') return Circle;
    if (s === 'running') return Loader2;
    if (s === 'success') return CheckCircle2;
    return AlertCircle;
  }

  function statusTint(s: ChildStatus): string {
    if (s === 'pending') return 'text-muted-foreground/50';
    if (s === 'running') return 'text-info animate-spin';
    if (s === 'success') return 'text-success';
    return 'text-destructive';
  }

  function rowTint(s: ChildStatus): string {
    if (s === 'success') return 'border-success/30 bg-success/5';
    if (s === 'error') return 'border-destructive/30 bg-destructive/5';
    if (s === 'running') return 'border-info/30 bg-info/5';
    return 'border-border/40 bg-card';
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <Search class="size-5 text-cyan-600 dark:text-cyan-400" />
      First scan
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Run the daily scan once to populate your inbox before you finish onboarding. Usually 1–3
      minutes — the authenticated LinkedIn / Indeed scrapers take the longest, the API-based ones
      finish in seconds.
    </p>
  </header>

  <div class="rounded-md border border-border/40 bg-card px-4 py-3 space-y-3">
    <div class="flex items-center justify-between">
      <div class="space-y-0.5">
        <h2 class="text-sm font-semibold">Scan-all fan-out</h2>
        <p class="text-[11px] text-muted-foreground">
          {data.children.length} scanner{data.children.length === 1 ? '' : 's'} active
          {#if started && !finished}· running for {elapsedSec}s{/if}
          {#if finished}· complete in {elapsedSec}s{/if}
        </p>
      </div>
      {#if !started}
        <Button onclick={startScan} class="gap-1.5">
          <Play class="size-3.5" /> Start scan
        </Button>
      {:else if !finished}
        <span class="text-[11px] text-info inline-flex items-center gap-1">
          <Loader2 class="size-3 animate-spin" /> Scanning…
        </span>
      {:else}
        <span class="text-[11px] text-success inline-flex items-center gap-1">
          <CheckCircle2 class="size-3" /> Scan complete · {scanAllFound} new
        </span>
      {/if}
    </div>

    <div class="space-y-1.5">
      {#each data.children as c (c.id)}
        {@const s = statuses[c.id] ?? { status: 'pending' }}
        {@const Icon = statusIcon(s.status)}
        <div class={cn('rounded-md border px-3 py-2 transition-colors', rowTint(s.status))}>
          <div class="flex items-center gap-2.5">
            <Icon class={cn('size-3.5 flex-shrink-0', statusTint(s.status))} />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium truncate">{c.label}</span>
                {#if s.found !== undefined && s.status === 'success'}
                  <span class="text-[11px] font-mono text-success">+{s.found}</span>
                {/if}
              </div>
              {#if s.message}
                <p class="text-[11px] text-muted-foreground/80 truncate mt-0.5">{s.message}</p>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if !started}
    <div class="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
      <p class="text-[11px] text-warning/90 leading-relaxed">
        First scan can take 1–3 minutes depending on how many sources are connected. You can keep
        the wizard open or skip ahead — the scan runs in the background either way.
      </p>
    </div>
  {/if}

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <a
      href="/onboarding/sources"
      class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
    >
      <ArrowLeft class="size-3" /> Back
    </a>
    <div class="flex items-center gap-3">
      {#if started && !finished}
        <button
          type="button"
          class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
          onclick={() => continueOn('skip')}
        >
          Skip ahead — keep scanning in background
        </button>
      {:else if !started}
        <button
          type="button"
          class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
          onclick={() => continueOn('skip')}
        >
          Skip — run the first scan later
        </button>
      {/if}
      <Button
        onclick={() => continueOn('complete')}
        disabled={started && !finished}
        class="gap-1.5"
      >
        Continue<ArrowRight class="size-4" />
      </Button>
    </div>
  </div>
</div>
