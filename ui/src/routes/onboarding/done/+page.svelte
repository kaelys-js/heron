<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Trophy, ArrowRight, Inbox, Settings, Plug, FileText } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { onMount } from 'svelte';

  let { data }: {
    data: {
      summary: {
        connectedCount: number;
        connectedLabels: string[];
        jobCount: number;
      };
    };
  } = $props();

  let marking = $state(true);
  let markError = $state<string | null>(null);

  // Mark the wizard complete on mount so revisits don't redirect back here.
  onMount(async () => {
    try {
      await api.post('/api/onboarding/complete', {}, { silent: true });
    } catch (e) {
      const err = e as ApiError;
      markError = err.message;
      toast.error('Could not mark complete', {
        description: err.message + ' — you can still use the dashboard, but the wizard may show again.',
      });
    } finally {
      marking = false;
    }
  });

  async function gotoInbox() {
    if (marking) return;
    await goto('/inbox');
  }
</script>

<div class="space-y-6">
  <header class="space-y-2 text-center pt-4">
    <div class="inline-flex size-12 rounded-full bg-amber-500/10 ring-1 ring-amber-500/30 items-center justify-center mx-auto">
      <Trophy class="size-6 text-amber-400" />
    </div>
    <h1 class="text-2xl font-semibold tracking-tight">You're set up.</h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">
      Career-ops is now scanning daily across every active source, scoring each posting against
      your CV, and queuing the high-fit ones in your inbox. You review, you click submit. No
      auto-applying, no surprises.
    </p>
  </header>

  <!-- Summary card -->
  <div class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-emerald-300">Setup summary</h2>
    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-0.5">
        <div class="text-2xl font-semibold tracking-tight">{data.summary.connectedCount}</div>
        <p class="text-[11px] text-muted-foreground">active source{data.summary.connectedCount === 1 ? '' : 's'}</p>
      </div>
      <div class="space-y-0.5">
        <div class="text-2xl font-semibold tracking-tight">{data.summary.jobCount.toLocaleString()}</div>
        <p class="text-[11px] text-muted-foreground">jobs in pipeline</p>
      </div>
    </div>
    {#if data.summary.connectedLabels.length > 0}
      <div class="flex flex-wrap gap-1 pt-1 border-t border-emerald-500/20">
        {#each data.summary.connectedLabels as label (label)}
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">{label}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- What happens next -->
  <div class="space-y-2">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</h2>
    <ul class="space-y-1.5">
      <li class="flex items-start gap-3 px-3 py-2 rounded-md border border-border/40 bg-card">
        <Inbox class="size-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <div class="text-[11px] leading-relaxed">
          <strong class="text-foreground">Inbox</strong> — everything new lands here. Scoring,
          tailored CV PDFs, cover letters, all one click away.
        </div>
      </li>
      <li class="flex items-start gap-3 px-3 py-2 rounded-md border border-border/40 bg-card">
        <Plug class="size-3.5 text-fuchsia-400 mt-0.5 flex-shrink-0" />
        <div class="text-[11px] leading-relaxed">
          <strong class="text-foreground">Sources</strong> — re-authenticate LinkedIn / Indeed if
          their session expires (LinkedIn typically every ~30 days), check pull counts.
        </div>
      </li>
      <li class="flex items-start gap-3 px-3 py-2 rounded-md border border-border/40 bg-card">
        <FileText class="size-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
        <div class="text-[11px] leading-relaxed">
          <strong class="text-foreground">Profile</strong> — extracted superpowers + proof points
          live there. Edit them any time; the deeper Claude evaluation reads them on every job.
        </div>
      </li>
      <li class="flex items-start gap-3 px-3 py-2 rounded-md border border-border/40 bg-card">
        <Settings class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div class="text-[11px] leading-relaxed">
          <strong class="text-foreground">Settings</strong> — change keys, adjust the daily scan
          time, re-run onboarding from scratch.
        </div>
      </li>
    </ul>
  </div>

  {#if markError}
    <div class="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
      <p class="text-[11px] text-amber-200/90 leading-relaxed">
        Couldn't mark onboarding complete: <code class="font-mono">{markError}</code>.
        You can still use the dashboard — the wizard will simply show on next visit until this is resolved.
      </p>
    </div>
  {/if}

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <span class="text-[11px] text-muted-foreground/70">Wizard complete · daily scan: 09:00 weekdays</span>
    <Button onclick={gotoInbox} disabled={marking} class="gap-1.5">
      Open inbox<ArrowRight class="size-4" />
    </Button>
  </div>
</div>
