<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import { Search, Sparkles, Send, Globe, Loader2, Activity as ActivityIcon } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration } from '$lib/utils';
  import { notifications } from '$lib/notifications.svelte';

  type AgentId = 'scan' | 'gemini' | 'apply-linkedin';

  let busy = $state<AgentId | null>(null);

  /**
   * Trigger a background task via /api/run. Mirrors the canonical pattern from
   * inbox/+page.svelte — busy state, success toast that points at the bell,
   * descriptive error toast with retry. The orchestrator emits per-line events
   * to the activity feed; the bell auto-toasts on completion.
   */
  async function trigger(id: AgentId, label: string) {
    if (busy) return;
    busy = id;
    try {
      const r = await withMinDuration(
        api.post<{ running: string[] }>('/api/run', { task: id }, { silent: true }),
        500,
      );
      const wasAlreadyRunning = (r.running ?? []).includes(id);
      if (wasAlreadyRunning) {
        toast.info(label + ' is already running', {
          description: 'Watch the activity feed below — a completion toast will pop when it finishes.',
        });
      } else {
        toast.success(label + ' started', {
          description: 'Streaming output below. The bell (top-right) will pop when it completes.',
        });
      }
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to start ' + label, {
        description: err.message,
        action: { label: 'Retry', onClick: () => trigger(id, label) },
      });
    } finally {
      busy = null;
    }
  }

  type AgentDef = {
    id: AgentId;
    name: string;
    desc: string;
    icon: any;
    button: string;
    busyLabel: string;
    notifies: string;
  };

  const agents: AgentDef[] = [
    {
      id: 'scan',
      name: 'Portal Scanner',
      desc: 'Hits LinkedIn / Indeed / Greenhouse / Ashby / Lever / The Muse / HN. Free, ~5 min.',
      icon: Globe,
      button: 'Run Scan',
      busyLabel: 'Scanning…',
      notifies: 'Activity feed streams every URL added. Final toast: "Scan finished — N new jobs". Errors surface as red toasts with a Retry button.',
    },
    {
      id: 'gemini',
      name: 'Gemini First-Pass',
      desc: 'Title-based scoring of every pending job. Free Gemini Flash. ~1 min for 800 jobs.',
      icon: Sparkles,
      button: 'Score with Gemini',
      busyLabel: 'Scoring…',
      notifies: 'Per-batch progress in the feed. Completion toast tells you how many were scored ≥ 4.0. Failures retry up to 3× before surfacing.',
    },
    {
      id: 'apply-linkedin',
      name: 'LinkedIn Easy Apply',
      desc: 'Auto-fills LinkedIn applications, stops at Submit. Caps 30/run.',
      icon: Send,
      button: 'Run LinkedIn Apply',
      busyLabel: 'Applying…',
      notifies: 'Per-job toasts as each application opens. If LinkedIn flags the session, you\'ll see a "Re-login required" warning with a link to Settings.',
    },
  ];

  let runningSet = $derived(new Set(notifications.runningTasks));
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Agents" subtitle="3 available" showTabs={false} />
  <div class="p-6">
    <div class="max-w-4xl mx-auto space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed max-w-3xl">
        Manual one-shot triggers for the Python tasks. For recurring schedules, use Autopilot.
        Output streams to the activity feed below — toasts pop on completion or failure.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tooltip.Provider delayDuration={300}>
          {#each agents as a}
            {@const Icon = a.icon}
            {@const isBusy = busy === a.id || runningSet.has(a.id)}
            <Card.Root class="flex flex-col">
              <Card.Header>
                <div class="flex items-start gap-3">
                  <div class="size-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {#if isBusy}
                      <ActivityIcon class="size-5 text-primary animate-pulse" />
                    {:else}
                      <Icon class="size-5 text-primary" />
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <Card.Title class="text-base flex items-center gap-2">
                      {a.name}
                      {#if isBusy}
                        <span class="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">running</span>
                      {/if}
                    </Card.Title>
                    <Card.Description class="text-xs mt-1">{a.desc}</Card.Description>
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
                        onclick={() => trigger(a.id, a.name)}
                        disabled={isBusy}
                      >
                        {#if isBusy}
                          <Loader2 class="size-3.5 animate-spin" />
                          {a.busyLabel}
                        {:else}
                          <Icon class="size-3.5" />
                          {a.button}
                        {/if}
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" class="text-xs max-w-xs">
                    {isBusy ? 'Already running — watch the feed below for output.' : a.desc}
                  </Tooltip.Content>
                </Tooltip.Root>
                <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
                  <span class="font-medium text-foreground/80">Notifications:</span> {a.notifies}
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
