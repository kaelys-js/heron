/** Unified notify() across Web / Electron / iOS. Last-mile bridge from
 *  the in-app SSE activity stream to OS notifications.
 *  Web + Electron: `new Notification(title, { body, icon })` (Electron
 *  also forwards to main-process Notification for hidden-window UX).
 *  iOS Capacitor: `LocalNotifications.schedule()` with immediate fire.
 *  Runtime platform detection -- single bundle everywhere. */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BRAND, BRAND_STORAGE_KEYS } from './brand';

// Brand-derived globalThis hook the Electron main process sets via preload
// to mirror notifications when the WebView is hidden. Derived so a rename
// doesn't leave a dead key that silently disables the bridge.
const NATIVE_NOTIFY_GLOBAL = `__${BRAND.name.toUpperCase().replace(/-/g, '_')}_NATIVE_NOTIFY__`;

export type NotifyLevel = 'info' | 'success' | 'warn' | 'error';

export type NotifyOptions = {
  title: string;
  body: string;
  /** Unique tag -- repeat calls with the same tag replace prior notification. */
  tag?: string;
  /** Click handler -- fires when the user taps the notification. */
  onClick?: () => void;
  /** Severity -- used for icon tinting on Electron + iOS. */
  level?: NotifyLevel;
  /** A `heron://` URL invoked on tap (iOS). */
  deepLink?: string;
};

let permissionGranted: boolean | null = null;

/**
 * Request OS-level permission to show notifications. Returns true if
 * granted, false otherwise. Safe to call repeatedly -- caches the result.
 *
 * On iOS Capacitor this triggers the native permission dialog; on
 * Electron + Web it triggers the browser's permission prompt.
 */
export async function requestPermission(): Promise<boolean> {
  if (permissionGranted !== null) {
    return permissionGranted;
  }

  const platform = Capacitor.getPlatform(); // 'web' | 'ios' | 'electron'

  if (platform === 'ios') {
    try {
      const res = await LocalNotifications.requestPermissions();
      permissionGranted = res.display === 'granted';
      return permissionGranted;
    } catch {
      permissionGranted = false;
      return false;
    }
  }

  // Web or Electron -- both use the Notification API
  if (typeof Notification === 'undefined') {
    permissionGranted = false;
    return false;
  }
  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }
  if (Notification.permission === 'denied') {
    permissionGranted = false;
    return false;
  }
  try {
    const res = await Notification.requestPermission();
    permissionGranted = res === 'granted';
    return permissionGranted;
  } catch {
    permissionGranted = false;
    return false;
  }
}

/**
 * Trigger an OS notification. Platform-specific routing happens here.
 *
 * Returns true if the notification was actually surfaced, false if
 * permission was missing or some platform error swallowed it.
 */
export async function notify(opts: NotifyOptions): Promise<boolean> {
  const granted = await requestPermission();
  if (!granted) {
    return false;
  }

  // Quiet-hours gate. Errors always go through -- a failed apply /
  // autopilot crash is exactly the kind of thing a user would want
  // to hear about even at 3am. Info/warn/success respect the window.
  if (opts.level !== 'error' && isInQuietHoursFromStorage()) {
    return false;
  }

  const platform = Capacitor.getPlatform();

  if (platform === 'ios') {
    // Capacitor local notifications require a numeric id -- derive from
    // tag hash so repeat calls with same tag overwrite.
    const id = tagToId(opts.tag ?? opts.title);
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: opts.title,
            body: opts.body,
            schedule: { at: new Date(Date.now() + 100) }, // fire ~immediately
            extra: opts.deepLink ? { deepLink: opts.deepLink } : undefined,
            sound: opts.level === 'error' ? 'default' : undefined,
            // Note: `smallIcon` is an Android drawable name; on iOS the
            // notification automatically inherits the app icon, so we
            // deliberately omit it here. Leaving an Android key in
            // place on iOS was a no-op but read as a bug at code review.
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  // Electron + Web both have the Notification global.
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: `/icons/${BRAND.name}-192.png`,
      silent: false,
    });
    if (opts.onClick) {
      n.onclick = () => opts.onClick!();
    }
    // Electron preload-bridge hook -- main-process Notification when the
    // WebView is hidden (better UX). Set by electron/preload.ts.
    const w = globalThis as Record<string, unknown>;
    const nativeNotify = w[NATIVE_NOTIFY_GLOBAL];
    if (typeof nativeNotify === 'function') {
      (nativeNotify as (msg: unknown) => void)({
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
        deepLink: opts.deepLink,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cheap deterministic tag→id hash for LocalNotifications. Stays within
 * Java int range (i.e. < 2^31). Same input → same id, so repeat calls
 * with the same tag replace the prior notification.
 */
function tagToId(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Drop all pending iOS notifications -- used by the "muted" toggle in
 * settings AND the sign-out path so a notification scheduled while
 * user A was signed in doesn't fire after user B signs in. Web/Electron
 * have no equivalent (Notification API can't un-show already-displayed
 * notifications).
 *
 * Also clears any DELIVERED notifications still sitting in the iOS
 * notification center so a user opening the app fresh doesn't see
 * stale "Scan complete · 3 new offers" taps that would deep-link them
 * to data they no longer have access to.
 */
export async function clearAllPending(): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    try {
      const list = await LocalNotifications.getPending();
      if (list.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: list.notifications });
      }
    } catch {
      // LocalNotifications plugin not available -- extension target or
      // permission denied. Either way there's nothing to drain.
    }
    try {
      // Delivered notifications API was added in @capacitor/local-notifications
      // v6; guard with a runtime check so older bundles don't throw.
      const ln = LocalNotifications as unknown as {
        getDeliveredNotifications?: () => Promise<{ notifications: Array<{ id: number }> }>;
        removeDeliveredNotifications?: (opts: {
          notifications: Array<{ id: number }>;
        }) => Promise<void>;
      };
      if (ln.getDeliveredNotifications && ln.removeDeliveredNotifications) {
        const delivered = await ln.getDeliveredNotifications();
        if (delivered.notifications.length > 0) {
          await ln.removeDeliveredNotifications({ notifications: delivered.notifications });
        }
      }
    } catch {
      // Same fallback as pending -- non-fatal.
    }
  }
}

/**
 * Quiet-hours preference shape -- stored in ui-prefs.json. Times are
 * 24-hour clock numbers (e.g. 22 = 10pm, 7 = 7am). When `enabled` is
 * false the gate always passes. When `start === end` quiet hours
 * never apply (zero-length window).
 *
 * Window semantics: a window like (22, 7) means "from 22:00 until
 * 07:00 the next morning" -- spans midnight. (8, 18) means "from 08:00
 * until 18:00 same day" -- does not span midnight.
 */
export type QuietHours = {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 0-23
};

/**
 * True when the current local time falls within the user's quiet-hours
 * window. Callers should bypass `notify()` for non-critical levels
 * during this window. Critical (`error`) notifications always go
 * through -- a failed apply / autopilot crash shouldn't be silenced.
 */
export function isInQuietHours(prefs: QuietHours, now: Date = new Date()): boolean {
  if (!prefs.enabled) {
    return false;
  }
  if (prefs.startHour === prefs.endHour) {
    return false;
  }
  const hour = now.getHours();
  if (prefs.startHour < prefs.endHour) {
    // Same-day window -- e.g. (8, 18) means 08:00-17:59.
    return hour >= prefs.startHour && hour < prefs.endHour;
  }
  // Cross-midnight window -- e.g. (22, 7) means 22:00-23:59 OR 00:00-06:59.
  return hour >= prefs.startHour || hour < prefs.endHour;
}

/**
 * Internal helper used by `notify()` -- reads the localStorage-backed
 * prefs and evaluates the window. Falls back to "not in quiet hours"
 * if storage is denied or the prefs blob is corrupt, so a broken
 * settings page can never silently silence the user.
 */
function isInQuietHoursFromStorage(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    // Sourced from BRAND_STORAGE_KEYS -- matches what
    // NotificationPreferences.svelte writes. Centralising the key here
    // means a brand rename retargets read + write together; previously
    // this was a hardcoded literal that would drift on rebrand.
    const raw = localStorage.getItem(BRAND_STORAGE_KEYS.quietHours);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as QuietHours;
    return isInQuietHours(parsed);
  } catch {
    return false;
  }
}

/**
 * Subscribe to taps on iOS LocalNotifications. The callback receives
 * the deepLink field set by `notify()`. Wire this up once at app boot
 * (in `App.svelte` or the topbar) to handle navigation on tap.
 */
export function onNotificationTap(handler: (deepLink: string) => void): () => void {
  if (Capacitor.getPlatform() !== 'ios') {
    return () => {};
  }
  const removeP = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const extra = e.notification?.extra as { deepLink?: string } | undefined;
    if (extra?.deepLink) {
      handler(extra.deepLink);
    }
  });
  return () => {
    void Promise.resolve(removeP).then((sub) => sub.remove());
  };
}
