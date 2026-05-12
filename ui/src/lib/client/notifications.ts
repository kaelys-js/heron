/**
 * Unified notifications client — single API across Web, Electron, iOS.
 *
 * The existing in-app SSE pipeline emits activity events. This module
 * is the LAST mile that turns one of those events into an OS-level
 * notification. Behavior per platform:
 *
 *   • Web browser            → `new Notification(title, { body, icon })`
 *                              (requires user-granted permission)
 *
 *   • Electron desktop       → same Notification API — works identically
 *                              in the Chromium WebView, AND we additionally
 *                              forward to Electron's main-process
 *                              Notification (better UX when WebView is
 *                              hidden behind another app)
 *
 *   • iOS Capacitor          → @capacitor/local-notifications.schedule()
 *                              with immediate fire time. Scheduled flag
 *                              lets us coalesce repeated identical pings.
 *
 * Each call goes through `notify(opts)`. Platform detection is runtime,
 * not build-time, so a single bundle works everywhere.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type NotifyLevel = 'info' | 'success' | 'warn' | 'error';

export type NotifyOptions = {
  title: string;
  body: string;
  /** Unique tag — repeat calls with the same tag replace prior notification. */
  tag?: string;
  /** Click handler — fires when the user taps the notification. */
  onClick?: () => void;
  /** Severity — used for icon tinting on Electron + iOS. */
  level?: NotifyLevel;
  /** A `careerops://` URL invoked on tap (iOS). */
  deepLink?: string;
};

let permissionGranted: boolean | null = null;

/**
 * Request OS-level permission to show notifications. Returns true if
 * granted, false otherwise. Safe to call repeatedly — caches the result.
 *
 * On iOS Capacitor this triggers the native permission dialog; on
 * Electron + Web it triggers the browser's permission prompt.
 */
export async function requestPermission(): Promise<boolean> {
  if (permissionGranted !== null) return permissionGranted;

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

  // Web or Electron — both use the Notification API
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
  if (!granted) return false;

  const platform = Capacitor.getPlatform();

  if (platform === 'ios') {
    // Capacitor local notifications require a numeric id — derive from
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
            smallIcon: 'ic_stat_career_ops',
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
      icon: '/icons/career-ops-192.png',
      silent: false,
    });
    if (opts.onClick) n.onclick = () => opts.onClick!();
    // Electron preload-bridge hook — main-process Notification when the
    // WebView is hidden (better UX). Set by electron/preload.ts.
    const w = globalThis as any;
    if (typeof w.__CAREER_OPS_NATIVE_NOTIFY__ === 'function') {
      w.__CAREER_OPS_NATIVE_NOTIFY__({
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
 * Drop all pending iOS notifications — used by the "muted" toggle in
 * settings. Web/Electron have no equivalent (Notification API can't
 * un-show already-displayed notifications).
 */
export async function clearAllPending(): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    try {
      const list = await LocalNotifications.getPending();
      if (list.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: list.notifications });
      }
    } catch {}
  }
}

/**
 * Subscribe to taps on iOS LocalNotifications. The callback receives
 * the deepLink field set by `notify()`. Wire this up once at app boot
 * (in `App.svelte` or the topbar) to handle navigation on tap.
 */
export function onNotificationTap(handler: (deepLink: string) => void): () => void {
  if (Capacitor.getPlatform() !== 'ios') return () => {};
  const removeP = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const extra = e.notification?.extra as { deepLink?: string } | undefined;
    if (extra?.deepLink) handler(extra.deepLink);
  });
  return () => {
    void Promise.resolve(removeP).then((sub) => sub.remove());
  };
}
