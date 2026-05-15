<!--
  NotificationPreferences — iOS quiet-hours toggle + on-device controls.

  Complements PushNotificationsToggle.svelte (which handles browser
  Notification API permission + level filters). This component handles:

    • Quiet-hours window — start/end hour 24h clock. Stored in
      localStorage under `<brand>:quiet-hours`. Read by the central
      notify() helper to skip non-error pings during the window.
    • Clear delivered iOS notifications now — useful when the user
      wants to wipe their notification center without waiting on
      tap-to-clear.

  Visible on every platform but the iOS-specific "Clear delivered now"
  button only shows when running native — on web the Notification API
  has no concept of delivered-vs-pending.
-->
<script lang="ts">
  import { Bell, Clock, Trash2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { BRAND_STORAGE_KEYS } from '$lib/client/brand';
  import { clearAllPending, isInQuietHours, type QuietHours } from '$lib/client/notifications';
  import { Capacitor } from '@capacitor/core';
  import { setSharedQuietHours } from '$lib/client/native-bridge';

  // Sourced from the centralised brand-storage map. Single source of
  // truth means the BackgroundFetcher (Swift) and this UI can never
  // drift on the same key — they read what's literally stored under
  // `BRAND.name:quiet-hours` regardless of any future rename.
  const STORAGE_KEY = BRAND_STORAGE_KEYS.quietHours;
  // Default: no quiet hours. Users opt in explicitly so we don't silently
  // suppress notifications they were expecting.
  const DEFAULT: QuietHours = { enabled: false, startHour: 22, endHour: 7 };

  let prefs = $state<QuietHours>({ ...DEFAULT });
  let isNative = $state(false);
  let clearing = $state(false);

  // Live preview of whether the current time falls inside the window —
  // helps the user understand "what would happen right now" while they
  // tweak the sliders.
  let nowInQuiet = $derived(isInQuietHours(prefs));

  onMount(() => {
    if (typeof window === 'undefined') return;
    isNative = Capacitor.getPlatform() !== 'web';
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<QuietHours>;
        prefs = {
          enabled: parsed.enabled ?? DEFAULT.enabled,
          startHour:
            typeof parsed.startHour === 'number' && parsed.startHour >= 0 && parsed.startHour <= 23
              ? parsed.startHour
              : DEFAULT.startHour,
          endHour:
            typeof parsed.endHour === 'number' && parsed.endHour >= 0 && parsed.endHour <= 23
              ? parsed.endHour
              : DEFAULT.endHour,
        };
      }
    } catch {
      // Corrupt prefs — keep defaults.
    }
    // Initial App Group mirror — without this the BackgroundFetcher
    // would read no prefs on first boot and never enforce quiet hours
    // until the user opened this settings page once. Pushing on mount
    // means the very first background fetch already honours the user's
    // preference (or the default of "disabled").
    void setSharedQuietHours(JSON.stringify(prefs));
  });

  function save() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage denied (Safari private mode) — runtime state
      // still works for this session.
    }
    // Mirror into App Group UserDefaults so the BackgroundFetcher
    // (an extension-like background task that runs OUTSIDE the
    // WebView's localStorage scope) can honour quiet hours when
    // deciding whether to deliver a warn-level notification at 3am.
    // No-op on web/desktop. We pass the FULL prefs as JSON so the
    // Swift side can decode the same shape — handles the cross-
    // midnight window logic identically in both languages.
    void setSharedQuietHours(JSON.stringify(prefs));
  }

  function toggleEnabled() {
    prefs = { ...prefs, enabled: !prefs.enabled };
    save();
  }

  function setStart(h: number) {
    prefs = { ...prefs, startHour: Math.max(0, Math.min(23, h)) };
    save();
  }
  function setEnd(h: number) {
    prefs = { ...prefs, endHour: Math.max(0, Math.min(23, h)) };
    save();
  }

  function formatHour(h: number): string {
    const period = h < 12 ? 'AM' : 'PM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:00 ${period}`;
  }

  async function clearDelivered() {
    if (clearing) return;
    clearing = true;
    try {
      await clearAllPending();
      toast.success('Notification center cleared', {
        description: 'Pending + delivered Heron notifications dropped.',
      });
    } catch (e) {
      toast.error('Could not clear notifications', { description: String(e) });
    } finally {
      setTimeout(() => {
        clearing = false;
      }, 600);
    }
  }
</script>

<div class="space-y-3">
  <div class="flex items-center gap-3">
    <Clock class="size-4 {prefs.enabled ? 'text-indigo-400' : 'text-muted-foreground'}" />
    <span class="text-sm flex-1">
      Quiet hours:
      <strong class={prefs.enabled ? 'text-indigo-300' : 'text-muted-foreground'}>
        {prefs.enabled ? 'on' : 'off'}
      </strong>
    </span>
    <Button size="sm" variant={prefs.enabled ? 'outline' : 'default'} onclick={toggleEnabled}>
      {prefs.enabled ? 'Disable' : 'Enable'}
    </Button>
  </div>

  {#if prefs.enabled}
    <div class="space-y-2 pl-7">
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <Label class="text-xs text-muted-foreground">From</Label>
          <select
            class="w-full text-sm rounded-md border border-border bg-background px-2 py-1"
            value={prefs.startHour}
            onchange={(e) => setStart(parseInt((e.target as HTMLSelectElement).value, 10))}
          >
            {#each Array(24) as _, h}
              <option value={h}>{formatHour(h)}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-1">
          <Label class="text-xs text-muted-foreground">Until</Label>
          <select
            class="w-full text-sm rounded-md border border-border bg-background px-2 py-1"
            value={prefs.endHour}
            onchange={(e) => setEnd(parseInt((e.target as HTMLSelectElement).value, 10))}
          >
            {#each Array(24) as _, h}
              <option value={h}>{formatHour(h)}</option>
            {/each}
          </select>
        </div>
      </div>
      {#if nowInQuiet}
        <p class="text-[11px] text-indigo-300/80 flex items-center gap-1">
          <Bell class="size-3" />
          You're inside the quiet window right now — only critical errors will ping.
        </p>
      {:else}
        <p class="text-[11px] text-muted-foreground/70">
          Non-critical pings will go silent between {formatHour(prefs.startHour)} and
          {formatHour(prefs.endHour)}. Errors always ping regardless.
        </p>
      {/if}
    </div>
  {/if}

  {#if isNative}
    <div class="flex items-center gap-3 pt-2 border-t border-border/40">
      <Trash2 class="size-4 text-muted-foreground" />
      <span class="text-sm flex-1">Clear pending + delivered notifications now</span>
      <Button size="sm" variant="outline" onclick={clearDelivered} disabled={clearing}>
        {clearing ? 'Clearing…' : 'Clear'}
      </Button>
    </div>
  {/if}
</div>
