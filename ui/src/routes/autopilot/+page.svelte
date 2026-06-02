<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import Stepper from '$lib/components/Stepper.svelte';
  import {
    Play,
    Power,
    AlertCircle,
    Clock,
    History,
    Search,
    Zap,
    Send,
    Sparkles,
    Activity,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    Info,
    ChevronDown,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';
  import type { AutopilotConfig, Schedule, ScheduleId, DailyTrigger } from '$lib/server/autopilot';
  import type { ActivityEvent } from '$lib/types';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  // Discard throws away in-progress edits -- same red double-click confirm
  // pattern as the rest of the app.
  const confirmDiscard = new ConfirmGate();
  onDestroy(() => confirmDiscard.destroy());

  let {
    data,
  }: {
    data: {
      config: AutopilotConfig;
      nextRunByScheduleId: Record<string, number | null>;
      history: ActivityEvent[];
    };
  } = $props();

  // svelte-ignore state_referenced_locally -- data.config seeds local mutable state; saved back via /api.
  let config = $state<AutopilotConfig>(structuredClone(data.config));
  let saving = $state(false);
  let runningId = $state<string | null>(null);
  let expandedDetails = $state<Set<string>>(new Set());

  let dirty = $derived(JSON.stringify(config) !== JSON.stringify(data.config));

  const TASK_ICONS: Record<string, any> = {
    scan: Search,
    gemini: Sparkles,
    'apply-linkedin': Send,
  };

  const WEEKDAY_LABELS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
  const WEEKDAY_FULL = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  function fmtSchedule(s: Schedule): string {
    if (s.trigger.type === 'after') {
      return 'When ' + s.trigger.task + ' completes';
    }
    if (s.trigger.type === 'weekly') {
      const t = s.trigger;
      return WEEKDAY_FULL[t.dayOfWeek] + ' at ' + formatTimeLabel(t.hour, t.minute);
    }
    const t = s.trigger;
    const time = formatTimeLabel(t.hour, t.minute);
    const days: number[] = t.weekdays;
    if (days.length === 0) return 'Every day at ' + time;
    if (days.length === 7) return 'Every day at ' + time;
    if (days.length === 5 && days.every((d: number) => [1, 2, 3, 4, 5].includes(d)))
      return 'Weekdays at ' + time;
    if (days.length === 2 && days.every((d: number) => [0, 6].includes(d)))
      return 'Weekends at ' + time;
    return days.map((d: number) => WEEKDAY_LABELS[d]).join(' · ') + ' at ' + time;
  }

  function formatTimeLabel(h: number, m: number): string {
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }

  function fmtCountdown(ts: number): string {
    const ms = ts - Date.now();
    if (ms < 0) return 'overdue';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'in <1m';
    if (min < 60) return 'in ' + min + 'm';
    const hr = Math.floor(min / 60);
    if (hr < 24) return 'in ' + hr + 'h ' + (min % 60) + 'm';
    const d = Math.floor(hr / 24);
    return 'in ' + d + 'd ' + (hr % 24) + 'h';
  }

  function updateSchedule(id: ScheduleId, patch: Partial<Schedule>) {
    config = {
      ...config,
      schedules: config.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    };
  }

  function setTime(id: ScheduleId, hour: number, minute: number) {
    const s = config.schedules.find((x) => x.id === id);
    if (!s || s.trigger.type !== 'daily') return;
    updateSchedule(id, { trigger: { ...s.trigger, hour, minute } });
  }

  function toggleWeekday(id: ScheduleId, day: number) {
    const s = config.schedules.find((x) => x.id === id);
    if (!s || s.trigger.type !== 'daily') return;
    const days = new Set(s.trigger.weekdays);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    updateSchedule(id, { trigger: { ...s.trigger, weekdays: [...days].sort() } });
  }

  function setWeekdayPreset(id: ScheduleId, preset: 'every' | 'weekdays' | 'weekends') {
    const map = { every: [], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
    const s = config.schedules.find((x) => x.id === id);
    if (!s || s.trigger.type !== 'daily') return;
    updateSchedule(id, { trigger: { ...s.trigger, weekdays: map[preset] } });
  }

  function isWeekdayPresetActive(s: Schedule, preset: 'every' | 'weekdays' | 'weekends'): boolean {
    if (s.trigger.type !== 'daily') return false;
    const w = s.trigger.weekdays;
    if (preset === 'every') return w.length === 0 || w.length === 7;
    if (preset === 'weekdays') return w.length === 5 && w.every((d) => [1, 2, 3, 4, 5].includes(d));
    if (preset === 'weekends') return w.length === 2 && w.every((d) => [0, 6].includes(d));
    return false;
  }

  function toggleDetails(id: string) {
    const next = new Set(expandedDetails);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedDetails = next;
  }

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    try {
      await withMinDuration(
        (async () => {
          await api.post('/api/autopilot', config, {
            successToast: { title: 'Autopilot saved', description: 'Schedules updated.' },
          });
          await invalidateAll();
        })(),
        500,
      );
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to save', { description: err.message });
    } finally {
      saving = false;
    }
  }

  let discardArmed = $derived(confirmDiscard.isArmed('discard'));
  function discard() {
    if (!confirmDiscard.trigger('discard')) return;
    config = structuredClone(data.config);
  }

  async function runNow(id: ScheduleId) {
    if (runningId) return;
    runningId = id;
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean; message: string }>('/api/autopilot/run', { id }, { silent: true }),
        450,
      );
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message);
    } finally {
      runningId = null;
    }
  }

  let enabledCount = $derived(config.schedules.filter((s) => s.enabled).length);
  let scheduledNext = $derived.by(() => {
    let earliest: { id: string; ts: number } | null = null;
    for (const [id, ts] of Object.entries(data.nextRunByScheduleId)) {
      if (ts == null) continue;
      const s = config.schedules.find((x) => x.id === id);
      if (!s?.enabled) continue;
      if (!earliest || ts < earliest.ts) earliest = { id, ts };
    }
    return earliest;
  });

  function levelDot(level: ActivityEvent['level']): string {
    return level === 'error'
      ? 'bg-destructive'
      : level === 'warn'
        ? 'bg-warning'
        : level === 'success'
          ? 'bg-success'
          : 'bg-info';
  }
  function levelIcon(level: ActivityEvent['level']) {
    return level === 'error'
      ? AlertTriangle
      : level === 'warn'
        ? AlertCircle
        : level === 'success'
          ? CheckCircle2
          : Info;
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Autopilot" showTabs={false} />
  <div class="p-6">
    <div class="max-w-4xl mx-auto space-y-5">
      <!-- Hero / master switch -->
      <Card.Root
        class={cn(
          'border-l-2 transition-colors',
          config.globalEnabled ? 'border-l-success/60' : 'border-l-border',
        )}
      >
        <Card.Content class="p-5 flex items-start gap-4">
          <div
            class={cn(
              'size-10 rounded-lg flex items-center justify-center flex-shrink-0 ring-1',
              config.globalEnabled
                ? 'bg-success/10 ring-success/30 text-success'
                : 'bg-muted ring-border text-muted-foreground',
            )}
          >
            <Power class="size-5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="text-base font-semibold">Master switch</h2>
              <span
                data-testid="autopilot-status"
                class={cn(
                  'text-[11px] uppercase tracking-wider font-medium',
                  config.globalEnabled ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {config.globalEnabled ? '● Active' : '○ Paused'}
              </span>
              <Switch
                checked={config.globalEnabled}
                onCheckedChange={(v: boolean) => (config = { ...config, globalEnabled: v })}
                class="ml-auto"
                aria-label="Toggle Autopilot active state"
              />
            </div>
            <p class="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {#if config.globalEnabled}
                {enabledCount}
                {enabledCount === 1 ? 'schedule is' : 'schedules are'} active.
                {#if scheduledNext}
                  Next:
                  <span class="text-foreground"
                    >{config.schedules.find((s) => s.id === scheduledNext!.id)?.name}</span
                  >
                  · <span class="text-success">{fmtCountdown(scheduledNext.ts)}</span>
                {:else}
                  No daily schedules enabled — only event triggers will fire.
                {/if}
              {:else}
                Autopilot is paused. Even with individual schedules enabled, nothing fires until
                this is on.
              {/if}
            </p>
          </div>
        </Card.Content>
      </Card.Root>

      {#if config.globalEnabled}
        <div
          class="flex items-start gap-2 px-3 py-2 rounded-md border border-info/30 bg-info/5 text-xs"
        >
          <Info class="size-3.5 text-info mt-0.5 flex-shrink-0" />
          <div class="text-info/80">
            The scheduler runs in-process while this dashboard is open. For 24/7 background runs,
            set up a macOS launchd agent that opens the dashboard at boot — or run scheduled tasks
            via cron instead.
          </div>
        </div>
      {/if}

      <!-- Schedule cards -->
      <div class="space-y-3">
        <h2 class="text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
          Schedules
        </h2>
        {#each config.schedules as s (s.id)}
          {@const Icon = TASK_ICONS[s.task] ?? Calendar}
          {@const next = data.nextRunByScheduleId[s.id]}
          {@const isRunning = runningId === s.id}
          {@const isExpanded = expandedDetails.has(s.id)}
          {@const isAfter = s.trigger.type === 'after'}
          <Card.Root
            class={cn(
              'border-l-2 transition-colors',
              s.enabled ? 'border-l-success/40' : 'border-l-border',
            )}
          >
            <Card.Content class="p-4 space-y-3">
              <div class="flex items-start gap-3">
                <div
                  class={cn(
                    'size-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1',
                    s.enabled
                      ? 'ring-border/40 bg-muted/40'
                      : 'ring-border/20 bg-muted/20 opacity-60',
                  )}
                >
                  <Icon class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-sm font-medium">{s.name}</h3>
                    <span class="text-[11px] font-mono text-muted-foreground/70">{s.taskLabel}</span
                    >
                    {#if isAfter}
                      <span class="text-[11px] uppercase tracking-wide text-muted-foreground/60"
                        >event-triggered</span
                      >
                    {/if}
                    {#if s.lastRunResult === 'started'}
                      <span
                        class="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-info"
                      >
                        <Activity class="size-2.5 animate-pulse" /> running
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {s.description}
                  </p>
                  <button
                    type="button"
                    onclick={() => toggleDetails(s.id)}
                    class="mt-1 text-[11px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1 transition-colors"
                  >
                    <ChevronDown
                      class={cn('size-3 transition-transform', isExpanded && 'rotate-180')}
                    />
                    {isExpanded ? 'Hide details' : 'What this does'}
                  </button>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  {#if !isAfter}
                    <Tooltip.Provider delayDuration={200}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              variant="outline"
                              size="sm"
                              class="h-7 text-xs gap-1.5"
                              onclick={() => runNow(s.id)}
                              disabled={isRunning}
                            >
                              <Play class="size-3" />
                              Run now
                            </Button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="bottom" class="text-xs"
                          >Trigger this schedule immediately</Tooltip.Content
                        >
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  {/if}
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v: boolean) => updateSchedule(s.id, { enabled: !!v })}
                    aria-label={`Toggle schedule "${s.name ?? s.id}"`}
                  />
                </div>
              </div>

              <!-- Expandable details -->
              <div
                class={cn(
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div class="overflow-hidden min-h-0">
                  <ul class="pl-12 pt-1 pb-1 space-y-1">
                    {#each s.details as line}
                      <li
                        class="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed"
                      >
                        <span class="text-muted-foreground/40 select-none mt-0.5">·</span>
                        <span>{line}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              </div>

              <!-- Schedule summary line -->
              <div class="pl-12 flex items-center gap-2 flex-wrap text-xs">
                <Clock class="size-3.5 text-muted-foreground" />
                <span class="font-medium text-foreground">{fmtSchedule(s)}</span>
                {#if next}
                  <span class="text-muted-foreground/70">· next {fmtCountdown(next)}</span>
                {/if}
              </div>

              {#if !isAfter && s.trigger.type === 'daily'}
                <!-- Schedule editor: time + weekday selector -->
                <div class="pl-12 pt-3 border-t border-border/40 space-y-3">
                  <div class="flex items-center gap-3 flex-wrap">
                    <Label
                      class="text-[11px] uppercase tracking-wider text-muted-foreground/80 w-20"
                      >Time</Label
                    >
                    <TimePicker
                      hour={s.trigger.hour}
                      minute={s.trigger.minute}
                      onchange={(h, m) => setTime(s.id, h, m)}
                    />
                  </div>

                  <div class="flex items-start gap-3 flex-wrap">
                    <Label
                      class="text-[11px] uppercase tracking-wider text-muted-foreground/80 w-20 mt-1.5"
                      >Days</Label
                    >
                    <div class="flex-1 space-y-2">
                      <!-- Quick presets -->
                      <div class="inline-flex rounded-md border overflow-hidden">
                        {#each [{ id: 'every' as const, label: 'Every day' }, { id: 'weekdays' as const, label: 'Weekdays' }, { id: 'weekends' as const, label: 'Weekends' }] as p, i}
                          {@const active = isWeekdayPresetActive(s, p.id)}
                          <button
                            type="button"
                            onclick={() => setWeekdayPreset(s.id, p.id)}
                            class={cn(
                              'h-7 px-3 text-[11px] font-medium transition-colors',
                              i > 0 && 'border-l',
                              active
                                ? 'bg-foreground text-background'
                                : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}>{p.label}</button
                          >
                        {/each}
                      </div>
                      <!-- Per-day toggles -->
                      <Tooltip.Provider delayDuration={250}>
                        <div class="flex items-center gap-1">
                          {#each WEEKDAY_LABELS as label, day}
                            {@const isOn =
                              s.trigger.type === 'daily' &&
                              (s.trigger.weekdays.length === 0 || s.trigger.weekdays.includes(day))}
                            {@const allDays =
                              s.trigger.type === 'daily' && s.trigger.weekdays.length === 0}
                            <Tooltip.Root>
                              <Tooltip.Trigger>
                                {#snippet child({ props })}
                                  <button
                                    {...props}
                                    type="button"
                                    onclick={() => toggleWeekday(s.id, day)}
                                    aria-label={(isOn ? 'Disable ' : 'Enable ') + WEEKDAY_FULL[day]}
                                    class={cn(
                                      'size-7 text-[11px] rounded-md font-medium border transition-all',
                                      isOn && !allDays
                                        ? 'bg-success/20 text-success border-success/40'
                                        : isOn && allDays
                                          ? 'bg-muted text-muted-foreground border-border/50'
                                          : 'bg-transparent text-muted-foreground/40 border-border/30 hover:border-border hover:text-foreground',
                                    )}>{label}</button
                                  >
                                {/snippet}
                              </Tooltip.Trigger>
                              <Tooltip.Content side="top" class="text-xs">
                                {WEEKDAY_FULL[day]}{allDays
                                  ? ' (every day)'
                                  : isOn
                                    ? ' · click to disable'
                                    : ' · click to enable'}
                              </Tooltip.Content>
                            </Tooltip.Root>
                          {/each}
                        </div>
                      </Tooltip.Provider>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Last run -->
              {#if s.lastRunAt}
                <div class="pl-12 flex items-center gap-2 text-[11px] pt-1">
                  {#if s.lastRunResult === 'success'}
                    <CheckCircle2 class="size-3 text-success" />
                    <span class="text-success">Last run: success</span>
                  {:else if s.lastRunResult === 'failure'}
                    <AlertTriangle class="size-3 text-destructive" />
                    <span class="text-destructive">Last run: failed</span>
                  {:else}
                    <Activity class="size-3 text-info animate-pulse" />
                    <span class="text-info">Last run: in progress</span>
                  {/if}
                  <span class="text-muted-foreground">· {formatRelativeTime(s.lastRunAt)}</span>
                  {#if s.lastRunMessage}
                    <span class="text-muted-foreground/70 truncate">— {s.lastRunMessage}</span>
                  {/if}
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </div>

      <!-- Thresholds -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm flex items-center gap-2">
            <Zap class="size-3.5 text-muted-foreground" /> Thresholds
          </Card.Title>
          <Card.Description class="text-xs">Apply across all schedules.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
            <div class="space-y-1">
              <Label class="text-xs font-medium">Auto-evaluate score</Label>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Jobs at or above this Gemini score get queued for deep Claude evaluation.
                <span class="text-muted-foreground/70"
                  >Range 0.0–5.0. <span class="text-success/80">4.0 is the standard cutoff</span> — lower
                  casts a wider net at higher cost.</span
                >
              </p>
            </div>
            <Stepper
              value={config.thresholds.autoEvaluateScore}
              onchange={(v) =>
                (config = {
                  ...config,
                  thresholds: { ...config.thresholds, autoEvaluateScore: v },
                })}
              min={0}
              max={5}
              step={0.1}
              decimals={1}
              suffix="/5"
              label="Auto-evaluate score"
              class="w-32"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
            <div class="space-y-1">
              <Label class="text-xs font-medium">Max auto-evals / run</Label>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Cap on how many deep Claude evaluations run in one batch after Gemini scoring.
                <span class="text-muted-foreground/70"
                  >Each costs ~$0.30–$1.00 in Claude usage. At 10/run × daily scans, expect
                  ~$3–$10/day if your pipeline runs hot. The 1h cooldown prevents accidental
                  double-billing from manual rescans.</span
                >
              </p>
            </div>
            <Stepper
              value={config.thresholds.maxAutoEvalsPerRun}
              onchange={(v) =>
                (config = {
                  ...config,
                  thresholds: { ...config.thresholds, maxAutoEvalsPerRun: v },
                })}
              min={1}
              max={50}
              step={1}
              decimals={0}
              suffix=" / run"
              label="Max auto-evals per run"
              class="w-32"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
            <div class="space-y-1">
              <Label class="text-xs font-medium">Max applies / day</Label>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                LinkedIn Easy Apply stops after this many submissions in a UTC day.
                <span class="text-muted-foreground/70"
                  >Above ~50/day risks LinkedIn flagging the account — keep this conservative.</span
                >
              </p>
            </div>
            <Stepper
              value={config.thresholds.maxAppliesPerDay}
              onchange={(v) =>
                (config = { ...config, thresholds: { ...config.thresholds, maxAppliesPerDay: v } })}
              min={1}
              max={100}
              step={1}
              decimals={0}
              suffix="/day"
              label="Max applies per day"
              class="w-32"
            />
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Save bar -->
      {#if dirty}
        <div
          class="sticky bottom-4 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-warning/40 bg-warning/10 backdrop-blur-md shadow-lg"
        >
          <AlertCircle class="size-4 text-warning" />
          <span class="text-xs text-warning flex-1">Unsaved changes</span>
          <Button
            variant="ghost"
            size="sm"
            class={cn(
              'h-7 transition-all',
              discardArmed &&
                'bg-destructive/15 text-destructive hover:bg-destructive/25 ring-1 ring-destructive/40 animate-pulse',
            )}
            onclick={discard}
            disabled={saving}
          >
            {discardArmed ? 'Click again to discard' : 'Discard'}
          </Button>
          <Button size="sm" class="h-7" onclick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      {/if}

      <!-- History -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm flex items-center gap-2">
            <History class="size-3.5 text-muted-foreground" /> Recent activity
          </Card.Title>
          <Card.Description class="text-xs"
            >Last 50 events from Autopilot, scan, gemini, and apply tasks.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          {#if data.history.length === 0}
            <EmptyState
              size="sm"
              variant="inline"
              icon={History}
              description="No autopilot activity yet. Enable a schedule to start collecting history."
            />
          {:else}
            <ul class="space-y-1.5">
              {#each data.history as ev (ev.id)}
                {@const LIcon = levelIcon(ev.level)}
                <li class="flex items-start gap-2.5 text-xs">
                  <span class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', levelDot(ev.level))}
                  ></span>
                  <LIcon class="size-3 mt-0.5 flex-shrink-0 text-muted-foreground/70" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2">
                      <span class="font-medium overflow-hidden whitespace-nowrap">{ev.title}</span>
                      <span class="text-[11px] text-muted-foreground ml-auto flex-shrink-0"
                        >{formatRelativeTime(ev.ts)}</span
                      >
                    </div>
                    {#if ev.message}
                      <p
                        class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed overflow-hidden whitespace-nowrap"
                      >
                        {ev.message}
                      </p>
                    {/if}
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-[11px] text-muted-foreground/60 font-mono">{ev.source}</span
                      >
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
