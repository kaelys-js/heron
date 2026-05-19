/**
 * notifications.ts -- bridge between the embedded SvelteKit server's
 * activity event bus and macOS/Windows/Linux OS notifications.
 *
 * Two delivery paths:
 *
 *   1. **Direct from the renderer (preferred)**: the web page calls
 *      `new Notification(title, body)`. Electron exposes the standard
 *      browser API, which routes to the native NotificationCenter
 *      (macOS) / Action Center (Windows) / libnotify (Linux). The
 *      renderer code in `ui/src/lib/client/notifications.ts` already
 *      does this -- Electron just needs the right entitlements + an app
 *      user model id so Windows binds the toast to the correct app.
 *
 *   2. **From the main process (for events that arrive while the
 *      renderer is unfocused / backgrounded)**: this module exports
 *      `showOsNotification()` which the IPC handler can call.
 *
 * Requires app.setAppUserModelId() on Windows (set in setup.ts) so the
 * notification carries the right app name + icon in the Action Center.
 */

import { Notification, app, nativeImage } from 'electron';
import path from 'node:path';

let iconPath: string | null = null;

/** Resolve the app icon for the toast. Called once at startup so we
 *  don't hit the filesystem on every notification. */
function resolveIcon(): Electron.NativeImage | undefined {
  if (iconPath === null) {
    const candidates = [
      path.join(__dirname, '../build/icon.png'),
      path.join(app.getAppPath(), 'build/icon.png'),
      path.join(app.getAppPath(), '../build/icon.png'),
    ];
    for (const p of candidates) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          iconPath = p;
          return img;
        }
      } catch {
        /* try next */
      }
    }
    iconPath = '';
  }
  if (!iconPath) return undefined;
  return nativeImage.createFromPath(iconPath);
}

export type OsNotificationOptions = {
  title: string;
  body: string;
  /** Override the click handler. Default opens the main window. */
  onClick?: () => void;
  /** Silent toast (no sound). Default false. */
  silent?: boolean;
  /** Subtitle (macOS only). */
  subtitle?: string;
  /** Urgency -- 'low' | 'normal' | 'critical' (Linux). */
  urgency?: 'low' | 'normal' | 'critical';
};

/** Show a native OS notification. No-op if Notification.isSupported()
 *  returns false (very old OS / sandboxed). */
export function showOsNotification(opts: OsNotificationOptions): Notification | null {
  if (!Notification.isSupported()) return null;
  const icon = resolveIcon();
  const n = new Notification({
    title: opts.title,
    body: opts.body,
    subtitle: opts.subtitle,
    silent: opts.silent ?? false,
    urgency: opts.urgency,
    icon,
  });
  if (opts.onClick) n.on('click', opts.onClick);
  n.show();
  return n;
}

/** Probe -- useful for the verifier or runtime self-checks. */
export function notificationsSupported(): boolean {
  return Notification.isSupported();
}
