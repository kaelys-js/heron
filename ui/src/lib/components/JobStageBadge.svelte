<script lang="ts">
  /**
   * JobStageBadge -- compact "days since touched + next action" badge
   * for surfacing stage-state on pipeline rows + job-page headers.
   *
   * Reads from the `stage` prop (the JobStageState shape from
   * lib/server/stage-state.ts). When `stage` is null/undefined, the
   * component renders nothing -- drop-in safe.
   *
   * Props:
   *   stage:       JobStageState | null
   *   compact:     when true, only show the days-since pill (no next-action)
   */

  type StageTransition = { status: string; at: number; note?: string };
  type NextAction = { dueAt: number; kind: string; note?: string; interviewerName?: string };
  type JobStageState = {
    stageHistory: StageTransition[];
    lastTouchAt: number;
    nextActionDue?: NextAction;
    ghostedAt?: number;
  };

  let { stage, compact = false }: { stage: JobStageState | null; compact?: boolean } = $props();

  const now = Date.now();

  function daysSince(ms: number): number {
    return Math.floor((now - ms) / (24 * 60 * 60 * 1000));
  }

  function hoursTo(ms: number): number {
    return Math.ceil((ms - now) / (60 * 60 * 1000));
  }

  function staleTint(days: number): string {
    if (days >= 21) return 'border-zinc-600/40 bg-zinc-700/15 text-muted-foreground border-dashed';
    if (days >= 14) return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    if (days >= 7) return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200';
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
  }

  function dueTint(hours: number): string {
    if (hours < 0) return 'border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-200';
    if (hours < 24) return 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-200';
    if (hours < 72)
      return 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-200';
    return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200';
  }
</script>

{#if stage}
  <div class="flex flex-wrap items-center gap-1.5">
    {#if stage.ghostedAt}
      <span
        class="rounded border border-zinc-600/40 bg-zinc-700/15 px-1.5 py-0.5 text-[11px] text-muted-foreground border-dashed"
      >
        ghosted
      </span>
    {:else}
      <span
        class="rounded border px-1.5 py-0.5 text-[11px] {staleTint(daysSince(stage.lastTouchAt))}"
      >
        {daysSince(stage.lastTouchAt)}d quiet
      </span>
    {/if}
    {#if !compact && stage.nextActionDue}
      {@const hrs = hoursTo(stage.nextActionDue.dueAt)}
      <span
        class="rounded border px-1.5 py-0.5 text-[11px] {dueTint(hrs)}"
        title={stage.nextActionDue.note ?? stage.nextActionDue.kind}
      >
        {stage.nextActionDue.kind.replace('-', ' ')}
        {hrs < 0
          ? `· ${Math.abs(hrs)}h overdue`
          : hrs < 48
            ? `· in ${hrs}h`
            : `· in ${Math.ceil(hrs / 24)}d`}
      </span>
    {/if}
  </div>
{/if}
