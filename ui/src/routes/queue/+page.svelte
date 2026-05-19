<script lang="ts">
  /**
   * /queue -- supervises the autonomous-apply pipeline. Sections:
   *
   *   ▸ Applying (live)         -- script running, with step name
   *   ▸ Queued                  -- waiting on the drain (sorted by score)
   *   ▸ Manual-apply-needed     -- soft-failed, finish from Inbox
   *
   * Header counts: "today X/cap · M applying · N queued · K need review".
   * Primary CTA: "Run drain now" → fires apply-queue-drain manually.
   *
   * The legacy "Send N applications" batch button is preserved (footer)
   * for the non-autonomous flow where the user still wants the
   * "open + mark + linkedin-auto" batch dispatch.
   */
  import Topbar from '$lib/components/Topbar.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import JobCard from '$lib/components/JobCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Send,
    ListChecks,
    Loader2,
    Zap,
    Activity,
    Bell,
    Hourglass,
    AlertTriangle,
    Info,
    ArrowUpRight,
    Network as Linkedin,
  } from '@lucide/svelte';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { withMinDuration, cn } from '$lib/utils';
  import type { Job } from '$lib/types';
  import type { ApplyState } from '$lib/server/apply-state';

  let {
    data,
  }: {
    data: {
      queued: Job[];
      applying: Job[];
      manual: Job[];
      profileId: string;
      todayCount: number;
      cap: number;
      inFlight: Record<string, ApplyState>;
    };
  } = $props();

  const confirm = new ConfirmGate();
  onDestroy(() => confirm.destroy());

  let drainBusy = $state(false);
  let batchSendBusy = $state(false);
  let cancelBusy = $state<string | null>(null);
  let selected = $state(new Set<string>());

  // Auto-select every queued job by default; user can untick rows.
  // svelte-ignore state_referenced_locally
  $effect(() => {
    const next = new Set<string>();
    for (const j of data.queued) next.add(j.id);
    selected = next;
  });

  function toggleAll(check: boolean) {
    const next = new Set<string>();
    if (check) for (const j of data.queued) next.add(j.id);
    selected = next;
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function portalBadge(url: string): { label: string; tint: string } {
    if (/linkedin\.com/.test(url)) return { label: 'LinkedIn', tint: 'text-blue-300' };
    if (/(?:job-)?boards(?:\.eu)?\.greenhouse\.io/.test(url))
      return { label: 'Greenhouse', tint: 'text-emerald-300' };
    if (/ashbyhq\.com/.test(url)) return { label: 'Ashby', tint: 'text-fuchsia-300' };
    if (/lever\.co/.test(url)) return { label: 'Lever', tint: 'text-amber-300' };
    if (/workable\.com/.test(url)) return { label: 'Workable', tint: 'text-cyan-300' };
    if (/personio\./.test(url)) return { label: 'Personio', tint: 'text-pink-300' };
    if (/smartrecruiters\.com/.test(url))
      return { label: 'SmartRecruiters', tint: 'text-indigo-300' };
    if (/recruitee\.com/.test(url)) return { label: 'Recruitee', tint: 'text-orange-300' };
    if (/teamtailor\.com/.test(url)) return { label: 'Teamtailor', tint: 'text-rose-300' };
    if (/myworkdayjobs\.com/.test(url)) return { label: 'Workday', tint: 'text-yellow-300' };
    if (/indeed\.com/.test(url)) return { label: 'Indeed', tint: 'text-lime-300' };
    return { label: 'Other', tint: 'text-zinc-400' };
  }

  /** Fire apply-queue-drain manually via /api/agents/run. */
  async function runDrain() {
    if (drainBusy) return;
    drainBusy = true;
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean; message?: string }>(
          '/api/agents/run',
          { id: 'apply-queue-drain' },
          { silent: true },
        ),
        400,
      );
      if (r.ok) {
        toast.success('Drain started', {
          description:
            'apply-queue-drain is iterating the queue. Watch the bell + this page for progress.',
          duration: 8_000,
        });
        await invalidateAll();
      } else {
        toast.error('Drain refused', { description: r.message ?? 'Job runner returned !ok' });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Drain failed', {
        description: err.message,
        action: { label: 'Retry', onClick: () => runDrain() },
      });
    } finally {
      drainBusy = false;
    }
  }

  /** Revert a Queued job back to Scored so it stops getting drained. */
  async function cancelQueue(job: Job) {
    if (!job.url || cancelBusy) return;
    cancelBusy = job.id;
    try {
      await api.post('/api/status', { url: job.url, newStatus: 'Scored' }, { silent: true });
      toast.success('Removed from queue', {
        description: (job.company ?? '?') + ' · ' + (job.role ?? '?') + ' — back to Scored.',
      });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Cancel failed', { description: err.message });
    } finally {
      cancelBusy = null;
    }
  }

  /** Legacy batch send -- preserved for users without autonomous mode. */
  async function sendAll() {
    if (batchSendBusy || selected.size === 0) return;
    if (!confirm.trigger('send-all')) return;
    batchSendBusy = true;
    try {
      const ids = data.queued.filter((j) => selected.has(j.id)).map((j) => j.id);
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          linkedInQueued: number;
          linkedInDeferred: number;
          otherCount: number;
          cap: number;
          openInTabs: { id: string; url: string }[];
          message: string;
        }>('/api/queue/send', { jobIds: ids }, { silent: true }),
        500,
      );
      r.openInTabs.forEach((t, i) =>
        setTimeout(() => window.open(t.url, '_blank', 'noopener'), i * 300),
      );
      toast.success('Queue sent', { description: r.message, duration: 10_000 });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Send failed', {
        description: err.message + ' — nothing was applied. Retry to try again.',
        action: { label: 'Retry', onClick: () => sendAll() },
        duration: 12_000,
      });
    } finally {
      batchSendBusy = false;
    }
  }

  let sendArmed = $derived(confirm.isArmed('send-all'));
  let total = $derived(data.queued.length + data.applying.length + data.manual.length);
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Queue"
    subtitle={total === 0 ? 'empty' : total + ' in pipeline'}
    showTabs={false}
    showFilter={true}
  />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-1.5">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ListChecks class="size-5 text-fuchsia-400" />
          Apply queue
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed max-w-3xl">
          Live view of the autonomous-apply pipeline. Jobs land here when you click Apply (or
          auto-queue from a Ready CV). The apply-queue drain runs daily on weekdays; you can also
          kick it off manually with the button below. Soft-failures (CAPTCHA, anti-bot, unknown
          fields) flow to the Inbox with a "Open posting" CTA so you can finish them by hand.
        </p>
      </div>

      <!-- Counts header -->
      <div
        class="rounded-md border border-border/40 bg-card px-4 py-3 flex items-center gap-4 flex-wrap"
      >
        <div class="flex items-center gap-1.5 text-xs">
          <Hourglass class="size-3.5 text-fuchsia-400" />
          <span class="font-mono">{data.queued.length}</span>
          <span class="text-muted-foreground">queued</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <Loader2
            class={cn('size-3.5 text-blue-400', data.applying.length > 0 && 'animate-spin')}
          />
          <span class="font-mono">{data.applying.length}</span>
          <span class="text-muted-foreground">applying</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <AlertTriangle class="size-3.5 text-amber-400" />
          <span class="font-mono">{data.manual.length}</span>
          <span class="text-muted-foreground">need review</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs ml-auto">
          <Activity class="size-3.5 text-emerald-400" />
          <span class="font-mono">{data.todayCount}/{data.cap}</span>
          <span class="text-muted-foreground">applied today</span>
        </div>
        <Button
          onclick={runDrain}
          disabled={drainBusy || data.queued.length === 0 || data.todayCount >= data.cap}
          size="sm"
          class="gap-1.5"
        >
          {#if drainBusy}
            <Loader2 class="size-3.5 animate-spin" /> Starting…
          {:else}
            <Zap class="size-3.5" /> Run drain now
          {/if}
        </Button>
      </div>

      <!-- ── Applying ── -->
      {#if data.applying.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <Loader2 class="size-3 animate-spin text-blue-400" />
            Applying right now · {data.applying.length}
          </h2>
          {#each data.applying as job (job.id)}
            {@const state = data.inFlight[job.id]}
            {@const pb = portalBadge(job.url)}
            <div
              class="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-3"
            >
              <Loader2 class="size-4 animate-spin text-blue-400 mt-2 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <JobCard {job} />
                {#if state}
                  <div class="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span class={cn('font-mono', pb.tint)}>{pb.label}</span>
                    <span>·</span>
                    <span>step: {state.lastStep ?? '—'}</span>
                    <span>·</span>
                    <span>{state.stepHistory?.length ?? 0} events</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </section>
      {/if}

      <!-- ── Queued ── -->
      {#if data.queued.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <Hourglass class="size-3 text-fuchsia-400" />
            Queued · {data.queued.length}
          </h2>

          <div
            class="rounded-md border border-border/40 bg-muted/10 px-3 py-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground"
          >
            <input
              type="checkbox"
              checked={selected.size === data.queued.length}
              onchange={(e) => toggleAll((e.currentTarget as HTMLInputElement).checked)}
              class="size-3.5 rounded border-border accent-foreground"
              aria-label="Select all queued"
            />
            <span
              >{selected.size} / {data.queued.length} selected (for legacy batch-send below)</span
            >
            <div class="flex-1"></div>
          </div>

          {#each data.queued as job (job.id)}
            {@const pb = portalBadge(job.url)}
            <div class="flex items-start gap-3 rounded-md border border-border/40 bg-card p-3">
              <input
                type="checkbox"
                checked={selected.has(job.id)}
                onchange={() => toggleOne(job.id)}
                class="size-4 mt-2 rounded border-border accent-foreground flex-shrink-0"
                aria-label={'Toggle ' + job.company}
              />
              <div class="flex-1 min-w-0">
                <JobCard {job} />
                <div class="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span class={cn('font-mono', pb.tint)}>{pb.label}</span>
                  {#if job.profileId && job.profileId !== data.profileId && data.profileId !== 'all'}
                    <span>·</span>
                    <span class="font-mono opacity-70">{job.profileId}</span>
                  {/if}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => cancelQueue(job)}
                disabled={cancelBusy === job.id}
                class="text-[11px] h-7 text-muted-foreground hover:text-red-300"
              >
                {#if cancelBusy === job.id}
                  <Loader2 class="size-3 animate-spin" />
                {:else}
                  Cancel
                {/if}
              </Button>
            </div>
          {/each}
        </section>
      {/if}

      <!-- ── ManualApplyNeeded ── -->
      {#if data.manual.length > 0}
        <section class="space-y-2">
          <h2
            class="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"
          >
            <AlertTriangle class="size-3 text-amber-400" />
            Auto-apply failed — finish by hand · {data.manual.length}
          </h2>
          <div
            class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2"
          >
            <Info class="size-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
            <p class="text-[11px] text-amber-100/90 leading-relaxed">
              These hit a soft block during auto-apply (CAPTCHA, anti-bot, unknown form field). The
              Inbox has a "Open posting" CTA on each one — finish them in the browser, then mark
              Applied.
            </p>
          </div>
          {#each data.manual as job (job.id)}
            {@const pb = portalBadge(job.url)}
            <div class="flex items-start gap-3 rounded-md border border-amber-500/30 bg-card p-3">
              <Bell class="size-4 text-amber-400 mt-2 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <JobCard {job} />
                <div class="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span class={cn('font-mono', pb.tint)}>{pb.label}</span>
                </div>
              </div>
              {#if job.url}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => window.open(job.url, '_blank', 'noopener')}
                  class="text-[11px] h-7"
                >
                  <ArrowUpRight class="size-3 mr-1" /> Open
                </Button>
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      <!-- ── Legacy batch-send footer (only shows when there's a selection) ── -->
      {#if data.queued.length > 0 && selected.size > 0}
        <section class="space-y-2">
          <div
            class="rounded-md border border-border/40 bg-card px-4 py-3 flex items-center gap-3 flex-wrap"
          >
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Legacy batch-send</span>
              <span>·</span>
              <span>{selected.size} selected · LinkedIn auto-apply + open-tabs for the rest</span>
            </div>
            <div class="flex-1"></div>
            <Button
              variant="outline"
              size="sm"
              onclick={sendAll}
              disabled={batchSendBusy || selected.size === 0}
              class={cn(
                'gap-1.5 transition-all',
                sendArmed &&
                  'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 animate-pulse',
              )}
            >
              {#if batchSendBusy}
                <Loader2 class="size-3.5 animate-spin" /> Sending…
              {:else if sendArmed}
                <Send class="size-3.5" /> Click again to send {selected.size}
              {:else}
                <Send class="size-3.5" /> Batch send {selected.size}
              {/if}
            </Button>
          </div>
          <p class="text-[11px] text-muted-foreground/70 leading-relaxed pl-1">
            Use this when you want LinkedIn auto-apply + new-tab open for non-LinkedIn at the same
            time. Most users prefer "Run drain now" above — that respects your per-profile
            <code>autonomous_apply</code> opt-in.
          </p>
        </section>
      {/if}

      {#if total === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={ListChecks}
          title="Queue is empty"
          description="Generate a tailored CV for any Ready job — its status flips to Queued automatically once the PDF is on disk. Or click Apply on a Scored job to stage it for the drain."
        />
      {/if}
    </div>
  </div>
</div>
