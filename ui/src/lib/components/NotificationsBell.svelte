<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { notifications } from '$lib/notifications.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
  import {
    Bell,
    BellOff,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Info,
    Trash2,
    CheckCheck,
  } from '@lucide/svelte';
  import { formatRelativeTime, cn } from '$lib/utils';
  import type { ActivityEvent, EventLevel } from '$lib/types';
  import EmptyState from './EmptyState.svelte';
  import { BRAND_EVENTS } from '$lib/client/brand';
  import { ConfirmGate } from '$lib/confirm.svelte';

  // Clear-feed is destructive (wipes the entire activity log). Same red
  // double-click pattern as every other destructive action.
  const confirmClear = new ConfirmGate();
  function onClearClick(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmClear.trigger('clear')) return;
    notifications.clear();
  }
  let clearArmed = $derived(confirmClear.isArmed('clear'));

  let filter = $state<'all' | 'unread' | EventLevel>('all');
  let open = $state(false);

  function handleOpen() {
    // Defer past the current event tick so bits-ui's outside-click detector
    // doesn't see the toast click and immediately close us again.
    setTimeout(() => {
      filter = 'error';
      open = true;
    }, 0);
  }

  onMount(() => {
    notifications.init();
    if (typeof window !== 'undefined') {
      window.addEventListener(BRAND_EVENTS.openNotifications, handleOpen);
    }
  });
  onDestroy(() => {
    notifications.destroy();
    confirmClear.destroy();
    if (typeof window !== 'undefined') {
      window.removeEventListener(BRAND_EVENTS.openNotifications, handleOpen);
    }
  });

  let visible = $derived.by(() => {
    if (filter === 'all') return notifications.events;
    if (filter === 'unread')
      return notifications.events.filter((e) => notifications.unreadIds.has(e.id));
    return notifications.events.filter((e) => e.level === filter);
  });

  let unreadCount = $derived(notifications.unreadIds.size);

  function levelIcon(level: EventLevel) {
    return level === 'error'
      ? AlertCircle
      : level === 'warn'
        ? AlertTriangle
        : level === 'success'
          ? CheckCircle2
          : Info;
  }
  function levelColor(level: EventLevel) {
    return level === 'error'
      ? 'text-red-400'
      : level === 'warn'
        ? 'text-amber-400'
        : level === 'success'
          ? 'text-emerald-400'
          : 'text-blue-400';
  }

  const isMobile = useIsMobile();

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'error', label: 'Errors' },
    { id: 'warn', label: 'Warn' },
    { id: 'success', label: 'Success' },
  ];

  let expandedId = $state<string | null>(null);
  function onItemClick(ev: ActivityEvent) {
    notifications.markRead(ev.id);
    if (ev.stack) {
      expandedId = expandedId === ev.id ? null : ev.id;
      return;
    }
    if (ev.link) location.href = ev.link;
  }
</script>

<!--
  The notifications feed is a SCROLLABLE LIST not a simple action menu, so
  it goes through Sheet/DropdownMenu directly instead of ResponsiveActionMenu
  (which is designed for action lists). Same interior renders into both
  containers via the `feed` snippet at the bottom of this file.
-->
{#snippet trigger({ props }: { props: Record<string, unknown> })}
  <Button
    {...props}
    variant="ghost"
    size="icon"
    aria-label="Notifications"
    class="relative h-8 w-8"
    data-testid="notifications-bell"
  >
    {#if notifications.connected === 'error'}
      <BellOff class="size-4 text-muted-foreground" />
    {:else}
      <Bell class="size-4" />
    {/if}
    {#if unreadCount > 0}
      <Badge
        variant="default"
        class="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] font-mono rounded-full bg-red-500 text-white pointer-events-none"
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </Badge>
    {/if}
  </Button>
{/snippet}

{#snippet feed()}
  <div class="flex items-center justify-between px-3 py-2 border-b">
    <div class="flex items-center gap-2">
      <Bell class="size-3.5 text-muted-foreground" />
      <span class="text-sm font-medium">Notifications</span>
      <span class="text-xs text-muted-foreground">({notifications.events.length})</span>
    </div>
    <div class="flex items-center gap-1">
      {#if unreadCount > 0}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  onclick={() => notifications.markAllRead()}
                  aria-label="Mark all notifications read"
                >
                  <CheckCheck class="size-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom" class="text-xs">Mark all read</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/if}
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class={cn(
                  'h-7 w-7 transition-colors',
                  clearArmed &&
                    'text-red-300 bg-red-500/15 hover:bg-red-500/25 ring-1 ring-red-500/40 animate-pulse',
                )}
                onclick={onClearClick}
                aria-label={clearArmed ? 'Click again to clear all events' : 'Clear all events'}
              >
                <Trash2 class="size-3.5" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs">
            {clearArmed ? 'Click again to clear all events' : 'Clear all'}
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  </div>

  <div class="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30">
    {#each filters as f}
      <button
        onclick={() => (filter = f.id)}
        class={cn(
          'text-xs px-2 py-1 rounded transition-colors',
          filter === f.id
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
      >
        {f.label}
      </button>
    {/each}
  </div>

  <ScrollArea class="max-h-[420px]">
    <div class="py-1">
      {#if visible.length === 0}
        <EmptyState
          size="sm"
          variant="inline"
          icon={filter === 'unread' ? CheckCheck : Bell}
          title={filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
          description={filter === 'unread'
            ? 'Nothing new to read.'
            : 'Activity, errors, and task updates will land here.'}
        />
      {:else}
        {#each visible as ev (ev.id)}
          {@const Icon = levelIcon(ev.level)}
          {@const isUnread = notifications.unreadIds.has(ev.id)}
          {@const isExpanded = expandedId === ev.id}
          <button
            onclick={() => onItemClick(ev)}
            class={cn(
              'w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-l-2',
              isUnread ? 'border-l-foreground bg-muted/20' : 'border-l-transparent',
            )}
          >
            <Icon class={cn('size-3.5 mt-0.5 flex-shrink-0', levelColor(ev.level))} />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span
                  class={cn(
                    'text-xs font-medium',
                    !isExpanded && 'overflow-hidden whitespace-nowrap',
                  )}>{ev.title}</span
                >
                <span class="text-[11px] text-muted-foreground flex-shrink-0 ml-auto">
                  {formatRelativeTime(ev.ts)}
                </span>
              </div>
              {#if ev.message}
                <p
                  class={cn(
                    'text-xs text-muted-foreground mt-0.5 leading-relaxed',
                    !isExpanded && 'overflow-hidden whitespace-nowrap',
                  )}
                >
                  {ev.message}
                </p>
              {/if}
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[11px] text-muted-foreground/70 font-mono">{ev.source}</span>
                <span
                  class="text-[11px] px-1 py-0.5 rounded bg-muted text-muted-foreground capitalize"
                >
                  {ev.category}
                </span>
                {#if ev.stack}
                  <span class="text-[11px] text-muted-foreground/60 ml-auto"
                    >{isExpanded ? 'click to collapse' : 'click for stack'}</span
                  >
                {/if}
              </div>
              {#if isExpanded && ev.stack}
                <pre
                  class="mt-2 p-2 text-[11px] font-mono leading-snug bg-muted/40 border border-border/40 rounded overflow-x-auto whitespace-pre-wrap break-all">{ev.stack}</pre>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </ScrollArea>
{/snippet}

{#if isMobile.value}
  <Sheet.Root bind:open>
    <Sheet.Trigger>
      {#snippet child({ props })}
        {@render trigger({ props })}
      {/snippet}
    </Sheet.Trigger>
    <Sheet.Content
      side="bottom"
      showCloseButton={false}
      class="flex flex-col gap-0 p-0 rounded-t-2xl max-h-[85svh] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        aria-hidden="true"
        class="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30 flex-shrink-0"
      ></div>
      <Sheet.Title class="sr-only">Notifications</Sheet.Title>
      <Sheet.Description class="sr-only"
        >Recent activity, errors, and task updates.</Sheet.Description
      >
      {@render feed()}
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <DropdownMenu.Root bind:open>
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tipProps })}
            <DropdownMenu.Trigger>
              {#snippet child({ props: ddProps })}
                {@render trigger({ props: { ...tipProps, ...ddProps } })}
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom" class="text-xs">
          Notifications · {notifications.connected}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <DropdownMenu.Content side="bottom" align="end" class="w-[420px] p-0" sideOffset={8}>
      {@render feed()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
