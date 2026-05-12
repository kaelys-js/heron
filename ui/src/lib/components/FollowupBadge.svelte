<!--
  FollowupBadge — tiny urgency pill rendered next to a job on /applied and
  /inbox. Reads the cadence entry that the server-side loader pre-joined
  per job; renders nothing if no entry exists.

  Tints map to follow-up cadence's `urgency` enum:
    - urgent   red   "Follow up today"
    - overdue  amber "Follow up · Nd late"
    - waiting  blue  "Wait Nd"
    - cold     zinc  "Cold · stop chasing"
-->
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Bell, Clock, Hourglass, Snowflake } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import type { FollowupEntry, Urgency } from '$lib/server/followup-cadence';

  let {
    entry,
    class: className = '',
  }: {
    entry: FollowupEntry | undefined;
    class?: string;
  } = $props();

  const TINT: Record<Urgency, string> = {
    urgent: 'bg-red-500/15 text-red-300 border-red-500/40',
    overdue: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    waiting: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    cold: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  };

  const ICON: Record<Urgency, any> = {
    urgent: Bell,
    overdue: Clock,
    waiting: Hourglass,
    cold: Snowflake,
  };

  const LABEL: Record<Urgency, (e: FollowupEntry) => string> = {
    urgent: () => 'Follow up today',
    overdue: (e) =>
      'Late · ' +
      (e.daysUntilNext != null && e.daysUntilNext < 0 ? Math.abs(e.daysUntilNext) + 'd' : ''),
    waiting: (e) => 'Wait ' + (e.daysUntilNext ?? '?') + 'd',
    cold: () => 'Cold',
  };

  const HINT: Record<Urgency, (e: FollowupEntry) => string> = {
    urgent: (e) =>
      'Applied ' +
      e.daysSinceApplication +
      ' days ago · ' +
      (e.followupCount === 0
        ? 'no follow-up sent yet'
        : e.followupCount + ' follow-up' + (e.followupCount === 1 ? '' : 's')) +
      '. Today is the recommended day to nudge.',
    overdue: (e) =>
      'Last touched ' +
      (e.daysSinceLastFollowup ?? e.daysSinceApplication) +
      ' days ago · ' +
      'recommended next follow-up was ' +
      (e.daysUntilNext != null ? Math.abs(e.daysUntilNext) + 'd ago.' : 'overdue.'),
    waiting: (e) =>
      'Next follow-up suggested in ' +
      (e.daysUntilNext ?? '?') +
      ' days · stay patient until then.',
    cold: () =>
      'Past the cadence window with no response. Consider closing this one out instead of more nudges.',
  };
</script>

{#if entry}
  {@const Icon = ICON[entry.urgency]}
  <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <span
            {...props}
            class={cn(
              'inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-mono uppercase tracking-wider cursor-help',
              TINT[entry.urgency],
              className,
            )}
          >
            <Icon class="size-2.5" />
            {LABEL[entry.urgency](entry)}
          </span>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top" class="text-xs max-w-xs">
        {HINT[entry.urgency](entry)}
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
