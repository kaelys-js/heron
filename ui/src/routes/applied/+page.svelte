<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import JobCard from '$lib/components/JobCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import FollowupBadge from '$lib/components/FollowupBadge.svelte';
  import { Send, Bell, Clock, Hourglass, Snowflake } from '@lucide/svelte';
  let { data } = $props();

  // Group active jobs by follow-up urgency so the user reads the right
  // bucket first. Jobs without a cadence entry fall into 'other'.
  type Bucket = 'urgent' | 'overdue' | 'waiting' | 'cold' | 'other';
  let groups = $derived.by(() => {
    const out: Record<Bucket, typeof data.jobs> = {
      urgent: [], overdue: [], waiting: [], cold: [], other: [],
    };
    for (const j of data.jobs) {
      const entry = data.followups[j.id];
      const bucket: Bucket = entry ? entry.urgency : 'other';
      out[bucket].push(j);
    }
    return out;
  });

  const SECTIONS: { key: Bucket; label: string; icon: any; tint: string; description: string }[] = [
    {
      key: 'urgent',
      label: 'Follow up today',
      icon: Bell,
      tint: 'text-red-400',
      description: 'These have hit the recommended cadence — nudge now or risk going cold.',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      icon: Clock,
      tint: 'text-amber-400',
      description: 'Past the cadence window. Send a follow-up today; if no response in 5d move to cold.',
    },
    {
      key: 'waiting',
      label: 'Waiting',
      icon: Hourglass,
      tint: 'text-blue-400',
      description: 'In the cadence sweet spot. Resist nudging too early.',
    },
    {
      key: 'cold',
      label: 'Cold',
      icon: Snowflake,
      tint: 'text-zinc-400',
      description: 'Past the cadence + no response. Close these out and free up mental space.',
    },
    {
      key: 'other',
      label: 'Other active',
      icon: Send,
      tint: 'text-emerald-400',
      description: 'In flight; no cadence advice yet (very recently applied).',
    },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="My Applications"
    subtitle={data.jobs.length + ' active' + (data.cadenceMeta?.urgent ? ' · ' + data.cadenceMeta.urgent + ' need a nudge today' : '')}
    showTabs={false}
    showFilter={true}
  />
  <div class="p-6">
    <div class="max-w-3xl mx-auto space-y-6">

      {#if data.jobs.length === 0}
        <EmptyState
          size="lg"
          variant="card"
          icon={Send}
          title="No active applications"
          description="When you apply to a job, mark it as Applied from the job detail page — it'll show up here for follow-up tracking."
        />
      {/if}

      {#each SECTIONS as section}
        {@const items = groups[section.key]}
        {#if items.length > 0}
          {@const SIcon = section.icon}
          <section class="space-y-2.5">
            <header class="flex items-baseline gap-2">
              <SIcon class={'size-4 ' + section.tint} />
              <h2 class="text-sm font-semibold">{section.label}</h2>
              <span class="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </header>
            <p class="text-[11px] text-muted-foreground/80 leading-relaxed max-w-2xl">{section.description}</p>
            <div class="space-y-2">
              {#each items as job (job.id)}
                <div class="flex items-center gap-2">
                  <div class="flex-1 min-w-0">
                    <JobCard {job} />
                  </div>
                  <FollowupBadge entry={data.followups[job.id]} />
                </div>
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  </div>
</div>
