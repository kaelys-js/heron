<!--
  CompPreflightBadge — surfaces "ASK FOR $X · WALKAWAY $Y" before any
  interview stage. Half of phone screens die on the salary question
  because candidates have nothing pre-loaded; this fixes that with a
  zero-friction reminder right next to the JobActions row.

  Auto-fetches from /api/job/[id]/comp-preflight on mount. Hidden when
  the job is NOT in an interview stage (we don't want to clutter Scored
  / Applied with comp data they don't need yet).
-->
<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { DollarSign, ChevronDown, AlertTriangle } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { onMount } from 'svelte';
  import type { Status } from '$lib/types';

  let { jobId, status }: { jobId: string; status: Status } = $props();

  type Preflight = {
    ok: boolean;
    ask?: string;
    walkaway?: string;
    currency?: string;
    advice?: string;
    warning?: string;
    error?: string;
  };

  let preflight = $state<Preflight | null>(null);
  let loading = $state(true);

  const INTERVIEW_STAGES: Status[] = [
    'PhoneScreen',
    'Technical',
    'TakeHome',
    'Onsite',
    'Final',
    'Interview',
    'Screened',
  ];
  let show = $derived(INTERVIEW_STAGES.includes(status));

  onMount(async () => {
    if (!show) {
      loading = false;
      return;
    }
    try {
      const r = await api.get<Preflight>(
        '/api/job/' + encodeURIComponent(jobId) + '/comp-preflight',
        { silent: true },
      );
      preflight = r;
    } catch {
      preflight = null;
    } finally {
      loading = false;
    }
  });
</script>

{#if show && !loading && preflight?.ok && preflight.ask}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-success/40 bg-success/10 text-success text-[11px] font-medium hover:brightness-110 transition"
        >
          <DollarSign class="size-3" />
          <span>Comp pre-flight</span>
          <span class="opacity-70">· ask {preflight?.ask ?? ''}</span>
          <ChevronDown class="size-3 opacity-60" />
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-96 p-3 space-y-2">
      <div class="text-xs font-medium flex items-center gap-1.5">
        <DollarSign class="size-3 text-success" />
        Before the call · comp pre-flight
      </div>
      {#if preflight.warning}
        <div
          class="rounded border border-warning/40 bg-warning/5 px-2 py-1 flex items-start gap-1.5"
        >
          <AlertTriangle class="size-3 text-warning mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-warning/90 leading-relaxed">{preflight.warning}</p>
        </div>
      {/if}
      <div class="space-y-1 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground w-16">ASK:</span>
          <span class="font-mono text-success">{preflight.ask}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground w-16">WALKAWAY:</span>
          <span class="font-mono text-warning">{preflight.walkaway}</span>
        </div>
        <div class="text-[11px] text-muted-foreground/70 pt-1">Currency: {preflight.currency}</div>
      </div>
      <p
        class="text-[11px] text-muted-foreground/90 leading-relaxed pt-1 border-t border-border/30"
      >
        {preflight.advice}
      </p>
    </Popover.Content>
  </Popover.Root>
{/if}
