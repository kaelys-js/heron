<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { Clock } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    hour = $bindable(9),
    minute = $bindable(0),
    onchange,
    class: className,
  }: {
    hour: number;
    minute: number;
    onchange?: (h: number, m: number) => void;
    class?: string;
  } = $props();

  let open = $state(false);

  let displayLabel = $derived.by(() => {
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return h12 + ':' + String(minute).padStart(2, '0') + ' ' + ampm;
  });

  // Common quick presets
  const QUICK = [
    { label: '7:00 AM', h: 7,  m: 0 },
    { label: '8:30 AM', h: 8,  m: 30 },
    { label: '9:00 AM', h: 9,  m: 0 },
    { label: '10:30 AM', h: 10, m: 30 },
    { label: '12:00 PM', h: 12, m: 0 },
    { label: '5:30 PM', h: 17, m: 30 },
    { label: '8:00 PM', h: 20, m: 0 },
    { label: '10:00 PM', h: 22, m: 0 },
  ];

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  function setTime(h: number, m: number, close = false) {
    hour = h;
    minute = m;
    onchange?.(h, m);
    if (close) open = false;
  }

  function fmtHour(h: number): string {
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const suffix = h >= 12 ? 'p' : 'a';
    return h12 + suffix;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-background hover:bg-accent transition-colors text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          className
        )}
      >
        <Clock class="size-3.5 text-muted-foreground" />
        <span class="font-medium">{displayLabel}</span>
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content side="bottom" align="start" class="w-[280px] p-0">
    <div class="p-3 border-b">
      <div class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Quick presets</div>
      <div class="grid grid-cols-4 gap-1">
        {#each QUICK as q}
          {@const isActive = hour === q.h && minute === q.m}
          <button
            type="button"
            onclick={() => setTime(q.h, q.m, true)}
            class={cn(
              'h-7 text-[11px] rounded font-mono tabular-nums transition-colors',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
            )}
          >{q.label}</button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 divide-x">
      <div>
        <div class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Hour</div>
        <div class="max-h-48 overflow-y-auto px-1.5 pb-1.5">
          <div class="grid grid-cols-3 gap-1">
            {#each HOURS as h}
              {@const isActive = hour === h}
              <button
                type="button"
                onclick={() => setTime(h, minute)}
                class={cn(
                  'h-7 text-[11px] rounded font-mono tabular-nums transition-colors',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >{fmtHour(h)}</button>
            {/each}
          </div>
        </div>
      </div>
      <div>
        <div class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Minute</div>
        <div class="max-h-48 overflow-y-auto px-1.5 pb-1.5">
          <div class="grid grid-cols-3 gap-1">
            {#each MINUTES as m}
              {@const isActive = minute === m}
              <button
                type="button"
                onclick={() => setTime(hour, m)}
                class={cn(
                  'h-7 text-[11px] rounded font-mono tabular-nums transition-colors',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >:{String(m).padStart(2, '0')}</button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
