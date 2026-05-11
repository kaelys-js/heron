<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import JobCard from '$lib/components/JobCard.svelte';
  import { Send, ListChecks, Loader2, Network as Linkedin, ArrowUpRight, Info } from '@lucide/svelte';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { withMinDuration, cn } from '$lib/utils';
  import type { Job } from '$lib/types';

  let { data }: { data: { queued: Job[] } } = $props();

  const confirm = new ConfirmGate();
  onDestroy(() => confirm.destroy());

  let busy = $state(false);
  let selected = $state(new Set<string>());

  // svelte-ignore state_referenced_locally — initial seed; user will (de)select.
  $effect(() => {
    // Auto-select every queued job by default; the user can untick rows.
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

  let counts = $derived.by(() => {
    let linkedIn = 0;
    let other = 0;
    for (const j of data.queued) {
      if (!selected.has(j.id)) continue;
      if (/linkedin\.com/.test(j.url)) linkedIn++;
      else other++;
    }
    return { linkedIn, other, total: linkedIn + other };
  });

  async function sendAll() {
    if (busy || counts.total === 0) return;
    if (!confirm.trigger('send-all')) return;
    busy = true;
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
      // Open the non-LinkedIn URLs in new tabs (browser-side; same stagger
      // pattern as BulkActions).
      r.openInTabs.forEach((t, i) => setTimeout(() => window.open(t.url, '_blank', 'noopener'), i * 300));
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
      busy = false;
    }
  }

  let sendArmed = $derived(confirm.isArmed('send-all'));
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Queue"
    subtitle={data.queued.length === 0 ? 'empty' : data.queued.length + ' staged'}
    showTabs={false}
    showFilter={true}
  />

  <div class="p-6 pb-24">
    <div class="max-w-5xl mx-auto space-y-5">

      <!-- Hero -->
      <div class="space-y-1.5">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ListChecks class="size-5 text-fuchsia-400" />
          Send queue
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed max-w-3xl">
          Jobs that have a tailored CV ready and are waiting to be sent. The system flips them here
          automatically when CV generation finishes (<span class="font-mono">Ready → Queued</span>).
          Untick anything you don't want, then click Send to dispatch the rest in one shot —
          LinkedIn jobs go through the auto-apply bot, everything else opens in new tabs and is
          marked Applied immediately.
        </p>
      </div>

      <!-- Send-all bar -->
      {#if data.queued.length > 0}
        <div class="rounded-md border border-border/40 bg-card px-4 py-3 flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.size === data.queued.length}
              onchange={(e) => toggleAll((e.currentTarget as HTMLInputElement).checked)}
              class="size-4 rounded border-border accent-foreground"
            />
            <span class="text-muted-foreground">
              {selected.size} / {data.queued.length} selected
            </span>
          </div>
          <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
            {#if counts.linkedIn > 0}
              <span class="inline-flex items-center gap-1"><Linkedin class="size-3 text-blue-400" /> {counts.linkedIn} LinkedIn auto-apply</span>
            {/if}
            {#if counts.other > 0}
              <span class="inline-flex items-center gap-1"><ArrowUpRight class="size-3 text-violet-400" /> {counts.other} open + mark</span>
            {/if}
          </div>
          <div class="flex-1"></div>
          <Button
            onclick={sendAll}
            disabled={busy || counts.total === 0}
            class={cn(
              'gap-1.5 transition-all',
              sendArmed && 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 animate-pulse',
            )}
          >
            {#if busy}
              <Loader2 class="size-3.5 animate-spin" /> Sending…
            {:else if sendArmed}
              <Send class="size-3.5" /> Click again to send {counts.total}
            {:else}
              <Send class="size-3.5" /> Send {counts.total} {counts.total === 1 ? 'application' : 'applications'}
            {/if}
          </Button>
        </div>

        <div class="rounded-md border border-border/40 bg-muted/20 px-3 py-2 flex items-start gap-2">
          <Info class="size-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-muted-foreground/90 leading-relaxed">
            LinkedIn jobs run through the Easy-Apply automation in the background, capped per day by your
            <a href="/autopilot" class="text-foreground hover:underline">Autopilot settings</a>.
            Non-LinkedIn jobs each open in a new tab (allow popups for localhost so they all open at once)
            and are marked Applied straight away. If anything fails, a Retry button appears in the toast.
          </p>
        </div>

        <!-- Job list -->
        <div class="space-y-2">
          {#each data.queued as job (job.id)}
            {@const isLinkedIn = /linkedin\.com/.test(job.url)}
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(job.id)}
                onchange={() => toggleOne(job.id)}
                class="size-4 mt-3.5 rounded border-border accent-foreground flex-shrink-0"
                aria-label={'Toggle ' + job.company}
              />
              <div class="flex-1 min-w-0">
                <JobCard {job} />
              </div>
              <div class="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/60 mt-3.5 flex-shrink-0 flex items-center gap-1">
                {#if isLinkedIn}
                  <Linkedin class="size-3 text-blue-400" /> LinkedIn auto
                {:else}
                  <ArrowUpRight class="size-3 text-violet-400" /> Open + mark
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState
          size="lg"
          variant="card"
          icon={ListChecks}
          title="Queue is empty"
          description="Generate a tailored CV for any Ready job — its status flips to Queued automatically once the PDF is on disk, and the row appears here. Or use 'Queue for batch send' from any job's Apply menu."
        />
      {/if}
    </div>
  </div>
</div>
