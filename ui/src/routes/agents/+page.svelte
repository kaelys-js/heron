<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import {
    Sparkles,
    Send,
    Globe,
    Loader2,
    Activity as ActivityIcon,
    FileCheck2,
    AlertOctagon,
    Shuffle,
    Compass,
    ClipboardList,
    Mail,
    ScanSearch,
    Brain,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration } from '$lib/utils';
  import { notifications } from '$lib/notifications.svelte';
  import type { JobSummary } from '$lib/server/jobs/types';

  let { data }: { data: { agents: JobSummary[] } } = $props();

  let busy = $state<string | null>(null);

  /** Map category → lucide icon (visual grouping). */
  function iconFor(category: JobSummary['category']): typeof Globe {
    switch (category) {
      case 'discovery':
        return Globe;
      case 'evaluation':
        return Sparkles;
      case 'apply':
        return Send;
      case 'hygiene':
        return Shuffle;
      case 'insight':
        return Brain;
      case 'system':
        return AlertOctagon;
    }
  }

  /** Format the trigger as a short label. */
  function triggerLabel(t: JobSummary['trigger']): string {
    if (t.type === 'manual') return 'Manual only';
    if (t.type === 'daily') {
      const time = String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0');
      const days =
        !t.weekdays || t.weekdays.length === 0
          ? 'every day'
          : t.weekdays.length === 5 && t.weekdays.every((d) => [1, 2, 3, 4, 5].includes(d))
            ? 'weekdays'
            : t.weekdays.length + ' days/wk';
      return 'Daily ' + days + ' @ ' + time;
    }
    if (t.type === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const time = String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0');
      return 'Weekly ' + days[t.dayOfWeek] + ' @ ' + time;
    }
    if (t.type === 'after') {
      return 'After ' + t.tasks.join(', ');
    }
    return '';
  }

  /**
   * POST /api/jobs/[id]/run -- the generic registry-driven trigger.
   * Falls back to /api/run for the legacy 4 task ids that orchestrator
   * still handles in its switch (scan, gemini, apply-linkedin, auto-eval)
   * so the busy state in `notifications.runningTasks` keeps working.
   */
  async function trigger(jobId: string, label: string) {
    if (busy) return;
    busy = jobId;
    const legacyIds = new Set(['scan', 'gemini', 'apply-linkedin', 'auto-eval']);
    try {
      if (legacyIds.has(jobId)) {
        // Legacy path keeps the running-tasks indicator in sync.
        const r = await withMinDuration(
          api.post<{ running: string[] }>('/api/run', { task: jobId }, { silent: true }),
          500,
        );
        const wasAlreadyRunning = (r.running ?? []).includes(jobId);
        if (wasAlreadyRunning) {
          toast.info(label + ' is already running', {
            description:
              'Watch the activity feed below — a completion toast will pop when it finishes.',
          });
        } else {
          toast.success(label + ' started', {
            description: 'Streaming output below. The bell (top-right) will pop when it completes.',
          });
        }
      } else {
        const r = await withMinDuration(
          api.post<{ jobId: string; success: boolean; message?: string; error?: string }>(
            '/api/jobs/' + encodeURIComponent(jobId) + '/run',
            {},
            { silent: true },
          ),
          500,
        );
        if (r.success) {
          toast.success(label + ' finished', {
            description: r.message ?? 'See the activity feed for details.',
          });
        } else {
          toast.error(label + ' failed', {
            description: r.error ?? 'Unknown error',
          });
        }
      }
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to start ' + label, {
        description: err.message,
        action: { label: 'Retry', onClick: () => trigger(jobId, label) },
      });
    } finally {
      busy = null;
    }
  }

  let runningSet = $derived(new Set(notifications.runningTasks));
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Agents" subtitle={data.agents.length + ' available'} showTabs={false} />
  <div class="p-6">
    <div class="max-w-4xl mx-auto space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed max-w-3xl">
        Manual one-shot triggers for every registered background task — discovery scanners,
        evaluators, hygiene sweeps, and insights. For recurring schedules, use Autopilot. Output
        streams to the activity feed below.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tooltip.Provider delayDuration={300}>
          {#each data.agents as a (a.id)}
            {@const Icon = iconFor(a.category)}
            {@const isBusy = busy === a.id || runningSet.has(a.id)}
            <Card.Root class="flex flex-col">
              <Card.Header>
                <div class="flex items-start gap-3">
                  <div
                    class="size-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"
                  >
                    {#if isBusy}
                      <ActivityIcon class="size-5 text-primary animate-pulse" />
                    {:else}
                      <Icon class="size-5 text-primary" />
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <Card.Title class="text-base flex items-center gap-2">
                      {a.label}
                      {#if isBusy}
                        <span
                          class="text-[11px] text-emerald-400 font-mono uppercase tracking-wider"
                          >running</span
                        >
                      {/if}
                    </Card.Title>
                    <Card.Description class="text-xs mt-1">{a.description}</Card.Description>
                  </div>
                </div>
              </Card.Header>
              <Card.Content class="space-y-2.5 mt-auto">
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        size="sm"
                        class="gap-1.5"
                        onclick={() => trigger(a.id, a.label)}
                        disabled={isBusy}
                      >
                        {#if isBusy}
                          <Loader2 class="size-3.5 animate-spin" />
                          Running…
                        {:else}
                          <Icon class="size-3.5" />
                          Run
                        {/if}
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" class="text-xs max-w-xs">
                    {isBusy ? 'Already running — watch the feed below for output.' : a.description}
                  </Tooltip.Content>
                </Tooltip.Root>
                <p
                  class="text-[11px] text-muted-foreground/70 leading-relaxed flex items-center gap-2"
                >
                  <span class="font-mono uppercase tracking-wider text-foreground/60"
                    >{a.category}</span
                  >
                  <span class="text-muted-foreground/40">·</span>
                  <span>{triggerLabel(a.trigger)}</span>
                </p>
              </Card.Content>
            </Card.Root>
          {/each}
        </Tooltip.Provider>
      </div>

      <div class="mt-8">
        <ActivityFeed />
      </div>
    </div>
  </div>
</div>
