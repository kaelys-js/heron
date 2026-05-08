<script lang="ts">
  import { onMount } from 'svelte';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { AlertCircle, CheckCircle2, Info, AlertTriangle, Activity } from '@lucide/svelte';
  import { formatRelativeTime } from '$lib/utils';
  import type { ActivityEvent } from '$lib/types';
  import { cn } from '$lib/utils';
  import EmptyState from './EmptyState.svelte';

  let { events: initialEvents = [] }: { events?: ActivityEvent[] } = $props();
  let events = $state<ActivityEvent[]>([]);
  $effect(() => { events = [...initialEvents]; });

  onMount(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        events = [ev, ...events].slice(0, 200);
      } catch {}
    };
    return () => es.close();
  });

  function levelIcon(level: string) {
    return level === 'error' ? AlertCircle
      : level === 'warn' ? AlertTriangle
      : level === 'success' ? CheckCircle2
      : Info;
  }
  function levelColor(level: string) {
    return level === 'error' ? 'text-red-400'
      : level === 'warn' ? 'text-amber-400'
      : level === 'success' ? 'text-emerald-400'
      : 'text-muted-foreground';
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-2 mb-1">
    <h3 class="text-sm font-semibold">Activity</h3>
    <span class="text-xs text-muted-foreground">{events.length}</span>
  </div>
  <ScrollArea class="max-h-[500px]">
    <div class="space-y-3 pr-2">
      {#each events as ev (ev.id ?? ev.ts + (ev.title?.slice(0, 20) ?? ''))}
        {@const Icon = levelIcon(ev.level)}
        <div class="flex gap-2.5 text-sm">
          <Avatar class="size-6 mt-0.5 flex-shrink-0">
            <AvatarFallback class="bg-muted text-[10px] uppercase">
              {ev.source.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="text-xs font-medium">{ev.source}</span>
              <span class="text-[10px] text-muted-foreground">{formatRelativeTime(ev.ts)}</span>
            </div>
            <p class={cn('text-xs leading-snug mt-0.5 break-words', levelColor(ev.level))}>
              <Icon class="inline size-3 mr-1 -mt-0.5" />
              {ev.title}{#if ev.message} — {ev.message}{/if}
            </p>
          </div>
        </div>
      {/each}
      {#if events.length === 0}
        <EmptyState
          size="sm"
          variant="inline"
          icon={Activity}
          description="No activity yet — kick off a scan or evaluation to see logs here."
        />
      {/if}
    </div>
  </ScrollArea>
</div>
