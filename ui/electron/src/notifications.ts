/** Bridge from the embedded SvelteKit activity bus to native OS
 *  notifications. Renderer path: `new Notification()` (default).
 *  Main-process fallback: `showOsNotification()` for events that
 *  arrive while the window is unfocused. Requires app.setAppUserModelId()
 *  on Windows (set in setup.ts) so toasts carry the app's name + icon. */

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
  if (!iconPath) {
    return undefined;
  }
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
  if (!Notification.isSupported()) {
    return null;
  }
  const icon = resolveIcon();
  const n = new Notification({
    title: opts.title,
    body: opts.body,
    subtitle: opts.subtitle,
    silent: opts.silent ?? false,
    urgency: opts.urgency,
    icon,
  });
  if (opts.onClick) {
    n.on('click', opts.onClick);
  }
  n.show();
  return n;
}

/** Probe -- useful for the verifier or runtime self-checks. */
export function notificationsSupported(): boolean {
  return Notification.isSupported();
}
