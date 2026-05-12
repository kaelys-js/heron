<script lang="ts">
  import { docTitle } from '$lib/config/branding';

  let { data } = $props();

  function dayLabel(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function timeLabel(ms: number): string {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function kindTint(kind: string): string {
    if (kind === 'interview') return 'bg-orange-500/15 text-orange-200 border-orange-500/40';
    if (kind === 'prep-block') return 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40';
    if (kind === 'decision-deadline') return 'bg-amber-500/15 text-amber-200 border-amber-500/50';
    return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40';
  }

  // Group entries by day for the timeline
  const byDay = $derived(() => {
    const m = new Map<string, typeof data.entries>();
    for (const ev of data.entries) {
      const key = new Date(ev.startAt).toISOString().slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(ev);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });
</script>

<svelte:head>
  <title>{docTitle(['Calendar'])}</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-6">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Calendar</h1>
      <p class="text-sm text-zinc-400">
        Next {data.days} days · {data.entries.length} entries
      </p>
    </div>
    <a
      href="/api/calendar/sync"
      class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
      title="Download an .ics feed you can subscribe to from Apple Calendar / Google Calendar"
    >
      Subscribe (.ics)
    </a>
  </header>

  {#if data.entries.length === 0}
    <div class="rounded-lg border border-zinc-700 bg-zinc-900/50 p-8 text-center">
      <p class="text-zinc-400">
        No upcoming interviews, prep blocks, or deadlines in the next {data.days} days.
      </p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each byDay() as [day, events]}
        <section class="rounded-lg border border-zinc-700 bg-zinc-900/30 p-4">
          <h2 class="mb-3 text-sm font-medium text-zinc-300">
            {dayLabel(new Date(day).getTime())}
          </h2>
          <div class="space-y-2">
            {#each events as ev (ev.id)}
              <a
                href={ev.href}
                class="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 hover:border-zinc-600"
              >
                <div class="flex items-center gap-3">
                  <span class="rounded border px-2 py-0.5 text-xs {kindTint(ev.kind)}"
                    >{ev.kind.replace('-', ' ')}</span
                  >
                  <div>
                    <div class="text-sm">{ev.title}</div>
                    {#if ev.company}
                      <div class="text-xs text-zinc-500">{ev.company}</div>
                    {/if}
                  </div>
                </div>
                <div class="text-xs text-zinc-400">
                  {timeLabel(ev.startAt)}
                  {#if ev.kind === 'prep-block' && ev.hasResources === false}
                    <span class="ml-2 text-amber-300">⚠ no dossier</span>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
