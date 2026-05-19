<!--
  PushNotificationsToggle — wraps the browser Notification API.

  Not Web Push (which needs VAPID + a service worker + a push server) —
  Heron is a local-only tool, so we use the simpler Notification API
  that fires OS-level notifications when the dashboard tab is open in
  the background. The existing SSE stream is the trigger source; this
  component just routes high-priority events through the Notification
  API when (a) permission is granted, (b) the tab is hidden, and (c)
  the event level is high enough.

  Settings live in localStorage so they survive across sessions without
  needing a server round-trip. Defaults: enabled for `error` + `success`
  + `warn` events; muted for `info`.
-->
<script lang="ts">
  import { Bell, BellOff, BellRing, CheckCircle2, AlertCircle, Loader2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { onMount, onDestroy } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { BRAND, BRAND_EVENTS, BRAND_STORAGE_PREFIX, BRAND_STORAGE_KEYS } from '$lib/client/brand';

  type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

  let permission = $state<Permission>('default');
  let enabledLevels = $state({ error: true, warn: true, success: true, info: false });
  let testing = $state(false);

  function loadPrefs() {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(BRAND_STORAGE_KEYS.pushPrefs);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        enabledLevels = { ...enabledLevels, ...parsed };
      } catch {}
    }
  }
  function savePrefs() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BRAND_STORAGE_KEYS.pushPrefs, JSON.stringify(enabledLevels));
  }

  function checkPermission(): Permission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as Permission;
  }

  async function requestPermission() {
    if (permission === 'unsupported') {
      toast.error('Notifications not supported', {
        description: "Your browser doesn't expose the Notification API.",
      });
      return;
    }
    if (permission === 'denied') {
      toast.error('Notifications blocked', {
        description: 'Re-enable in your browser settings (Site permissions).',
      });
      return;
    }
    try {
      const result = await Notification.requestPermission();
      permission = result as Permission;
      if (result === 'granted') {
        toast.success('Notifications enabled', {
          description: "You'll get OS-level pings for important events.",
        });
      } else {
        toast.info('Permission not granted', {
          description: 'You can enable later from your browser settings.',
        });
      }
    } catch (e) {
      toast.error('Could not request permission', { description: String(e) });
    }
  }

  function fireTest() {
    if (testing) return;
    testing = true;
    try {
      if (permission !== 'granted') {
        toast.error('Grant permission first');
        return;
      }
      new Notification(`${BRAND.displayName} · Test`, {
        body: "OS-level notifications are working. You'll see these for high-priority events when the tab is in the background.",
        icon: '/favicon.ico',
        tag: `${BRAND_STORAGE_PREFIX}:test`,
      });
      toast.success('Test notification fired');
    } finally {
      setTimeout(() => {
        testing = false;
      }, 800);
    }
  }

  // Install the SSE→Notification bridge. The notifications store dispatches
  // a `heron:notify` event for every new activity-feed entry; we
  // intercept and route to Notification when the tab is hidden + the
  // event level is enabled + permission is granted.
  function handleNotify(e: Event) {
    if (permission !== 'granted') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    const ce = e as CustomEvent<{
      level: string;
      title: string;
      message?: string;
      source?: string;
    }>;
    const ev = ce.detail;
    if (!ev) return;
    if (!enabledLevels[ev.level as keyof typeof enabledLevels]) return;
    try {
      // Title format: "Heron · <source>" -- leading display name
      // keeps it identifiable in the OS notification tray when many
      // apps are stacked. Empty source falls through to bare display
      // name rather than a trailing " · " separator with nothing after.
      const sourceSuffix = ev.source ? ' · ' + ev.source : '';
      new Notification(BRAND.displayName + sourceSuffix, {
        body: ev.title + (ev.message ? ' — ' + ev.message : ''),
        icon: '/favicon.ico',
        tag: `${BRAND_STORAGE_PREFIX}:` + (ev.source ?? 'evt'),
      });
    } catch {
      /* silently fail -- Notification can throw if quota exceeded */
    }
  }

  onMount(() => {
    permission = checkPermission();
    loadPrefs();
    if (typeof window !== 'undefined') {
      window.addEventListener(BRAND_EVENTS.notify, handleNotify);
    }
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(BRAND_EVENTS.notify, handleNotify);
    }
  });

  function toggle(level: keyof typeof enabledLevels) {
    enabledLevels = { ...enabledLevels, [level]: !enabledLevels[level] };
    savePrefs();
  }
</script>

<div class="space-y-3">
  <div class="flex items-center gap-3">
    {#if permission === 'granted'}
      <BellRing class="size-4 text-emerald-400" />
      <span class="text-sm"
        >OS notifications: <strong class="text-emerald-300">enabled</strong></span
      >
    {:else if permission === 'denied'}
      <BellOff class="size-4 text-red-400" />
      <span class="text-sm"
        >OS notifications: <strong class="text-red-300">blocked</strong> by browser</span
      >
    {:else if permission === 'unsupported'}
      <BellOff class="size-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground"
        >OS notifications: <strong>not supported</strong> in this browser</span
      >
    {:else}
      <Bell class="size-4 text-muted-foreground" />
      <span class="text-sm">OS notifications: <strong>not yet granted</strong></span>
    {/if}
    <div class="flex-1"></div>
    {#if permission !== 'granted' && permission !== 'unsupported'}
      <Button size="sm" onclick={requestPermission}>Enable</Button>
    {/if}
    {#if permission === 'granted'}
      <Button size="sm" variant="outline" onclick={fireTest} disabled={testing}>
        {#if testing}<Loader2 class="size-3 animate-spin" />{:else}Test{/if}
      </Button>
    {/if}
  </div>

  {#if permission === 'granted'}
    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">Notify me for:</Label>
      <div class="grid grid-cols-2 gap-1.5">
        {#each [{ level: 'error' as const, label: 'Errors', tint: 'text-red-300' }, { level: 'warn' as const, label: 'Warnings (ManualApplyNeeded, etc)', tint: 'text-amber-300' }, { level: 'success' as const, label: 'Successes (Applied, Offer received)', tint: 'text-emerald-300' }, { level: 'info' as const, label: 'Info (low priority)', tint: 'text-blue-300' }] as opt}
          <label class="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              class="size-3.5 rounded border-border accent-foreground"
              checked={enabledLevels[opt.level]}
              onchange={() => toggle(opt.level)}
            />
            <span class={opt.tint}>{opt.label}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <p class="text-[11px] text-muted-foreground/70 leading-relaxed">
    Uses the browser Notification API — fires when the dashboard tab is in the background.
    Local-only; no push server, no Web Push subscription. Daily digest runs every morning at 07:00
    via an autopilot job; that fires regardless of OS notification permission.
  </p>
</div>
