<!--
  ApplyTimingBadge — "Apply NOW" / "Day 5: still early" / "Day 14+: late"
  badge on the job detail page. Closes the application-timing gap that
  direct-apply users historically can't see: Day-1 applications convert
  3-5× more than Day-7+. The badge makes the timing window visible BEFORE
  the user spends 3 minutes tailoring a CV for a posting that's already
  buried under 200 earlier applicants.

  Hidden once a job leaves the apply-eligible stages (Applied / Interview /
  Offer / Rejected) — by then the timing is locked.
-->
<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { Clock, ChevronDown, Zap, AlertTriangle } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';
  import type { Status } from '$lib/types';

  let {
    jobId,
    profileId,
    status,
  }: { jobId: string; profileId?: string; status: Status } = $props();

  type Timing = {
    ok: boolean;
    firstSeen?: string | null;
    daysSinceFirstSeen?: number | null;
    band?: 'fresh' | 'good' | 'fading' | 'late';
    label?: string;
    advice?: string;
  };

  let timing = $state<Timing | null>(null);
  let loading = $state(true);

  const APPLY_ELIGIBLE: Status[] = ['New', 'Scoring', 'Scored', 'Ready', 'Queued'];
  let show = $derived(APPLY_ELIGIBLE.includes(status));

  let tint = $derived.by(() => {
    const b = timing?.band;
    if (b === 'fresh') return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200';
    if (b === 'good') return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
    if (b === 'fading') return 'border-orange-500/40 bg-orange-500/10 text-orange-200';
    return 'border-red-500/40 bg-red-500/10 text-red-200';
  });

  onMount(async () => {
    if (!show) { loading = false; return; }
    try {
      const pq = profileId ? '?profile=' + encodeURIComponent(profileId) : '';
      const r = await api.get<Timing>('/api/job/' + encodeURIComponent(jobId) + '/apply-timing' + pq, { silent: true });
      timing = r;
    } catch {
      timing = null;
    } finally {
      loading = false;
    }
  });
</script>

{#if show && !loading && timing?.ok && timing.band}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium hover:brightness-110 transition',
            tint,
          )}
        >
          {#if timing?.band === 'fresh'}
            <Zap class="size-3" />
          {:else if timing?.band === 'late'}
            <AlertTriangle class="size-3" />
          {:else}
            <Clock class="size-3" />
          {/if}
          <span>{timing?.label ?? ''}</span>
          {#if timing?.daysSinceFirstSeen != null}
            <span class="opacity-70">· Day {(timing?.daysSinceFirstSeen ?? 0) + 1}</span>
          {/if}
          <ChevronDown class="size-3 opacity-60" />
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-80 p-3 space-y-2">
      <div class="text-xs font-medium flex items-center gap-1.5">
        <Clock class="size-3" />
        Application timing
      </div>
      <div class="text-[11px] text-muted-foreground space-y-0.5">
        {#if timing.firstSeen}
          <p>First seen on <span class="font-mono text-foreground">{timing.firstSeen}</span></p>
        {:else}
          <p>Not yet in scan-history. The next daily scan will record the discovery date.</p>
        {/if}
        {#if timing.daysSinceFirstSeen != null}
          <p>Today is Day <span class="font-mono text-foreground">{timing.daysSinceFirstSeen + 1}</span> of the posting cycle.</p>
        {/if}
      </div>
      <p class="text-[11px] text-foreground/90 leading-relaxed pt-1 border-t border-border/30">
        {timing.advice}
      </p>
    </Popover.Content>
  </Popover.Root>
{/if}
