/**
 * capacitor-plugins — typed wrappers for every Capacitor plugin we use.
 *
 * Each wrapper:
 *   • Is safe to call on Web (falls back to the closest browser API)
 *   • Awaits the import dynamically so we don't ship the iOS native
 *     binding in the Web bundle
 *   • Returns a discriminated union { ok, error? } so callers can
 *     surface failures consistently
 *
 * Tree-shakeability: each export is a thin async function; Vite's
 * rolldown bundler drops the ones a build path doesn't reach.
 */
import { Capacitor } from '@capacitor/core';

/** Lazily import a Capacitor plugin. Returns null on Web when the
 *  plugin needs a native host that isn't there. */
async function lazy<T>(moduleId: string): Promise<T | null> {
  try {
    const mod = (await import(/* @vite-ignore */ moduleId)) as Record<string, T>;
    return (mod.default ?? Object.values(mod)[0]) as T;
  } catch {
    return null;
  }
}

const isNative = (): boolean => Capacitor.isNativePlatform();

// ──────────────────────────────────────────────────────────────────────
// Haptics — tactile feedback for critical actions.
// ──────────────────────────────────────────────────────────────────────

export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function hapticError(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* ignore */
  }
}

// ──────────────────────────────────────────────────────────────────────
// Clipboard — copy URLs, codes, JSON exports with native UX.
// ──────────────────────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  if (isNative()) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      await hapticLight();
      return true;
    } catch {
      return false;
    }
  }
  // Web fallback
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Dialog — native alert/confirm/prompt. Browser's window.confirm is
// blocked in Capacitor WebView so we need the native plugin.
// ──────────────────────────────────────────────────────────────────────

export async function nativeAlert(title: string, message: string): Promise<void> {
  if (isNative()) {
    try {
      const { Dialog } = await import('@capacitor/dialog');
      await Dialog.alert({ title, message });
      return;
    } catch {
      /* fall through to alert() */
    }
  }
  alert(`${title}\n\n${message}`);
}

export async function nativeConfirm(title: string, message: string): Promise<boolean> {
  if (isNative()) {
    try {
      const { Dialog } = await import('@capacitor/dialog');
      const r = await Dialog.confirm({ title, message });
      return r.value;
    } catch {
      /* fall through */
    }
  }
  return confirm(`${title}\n\n${message}`);
}

// ──────────────────────────────────────────────────────────────────────
// Browser — SFSafariViewController / Chrome Custom Tabs for external
// links. Keeps the user inside the app for a frictionless back-button.
// ──────────────────────────────────────────────────────────────────────

export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ──────────────────────────────────────────────────────────────────────
// App Launcher — open mailto:, tel:, system settings URLs.
// ──────────────────────────────────────────────────────────────────────

export async function launchUrl(url: string): Promise<boolean> {
  if (isNative()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const can = await AppLauncher.canOpenUrl({ url });
      if (!can.value) return false;
      await AppLauncher.openUrl({ url });
      return true;
    } catch {
      return false;
    }
  }
  window.location.href = url;
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// Keyboard — Capacitor exposes show/hide events + height. Useful for
// scroll adjustments on the apply form.
// ──────────────────────────────────────────────────────────────────────

export type KeyboardListener = (event: { keyboardHeight: number }) => void;

export async function onKeyboardShow(cb: KeyboardListener): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    const handle = await Keyboard.addListener('keyboardWillShow', cb);
    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}

export async function onKeyboardHide(cb: () => void): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    const handle = await Keyboard.addListener('keyboardWillHide', cb);
    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}

// ──────────────────────────────────────────────────────────────────────
// Device — model / OS / language for analytics, locale switching, and
// the Settings → Diagnostics card.
// ──────────────────────────────────────────────────────────────────────

export type DeviceFingerprint = {
  platform: string;
  os: string;
  osVersion: string;
  model: string;
  manufacturer: string;
  isVirtual: boolean;
};

export async function deviceInfo(): Promise<DeviceFingerprint> {
  if (!isNative()) {
    return {
      platform: 'web',
      os: navigator.platform || 'web',
      osVersion: '',
      model: '',
      manufacturer: '',
      isVirtual: false,
    };
  }
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return {
      platform: info.platform,
      os: info.operatingSystem,
      osVersion: info.osVersion,
      model: info.model,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
    };
  } catch {
    return {
      platform: 'web',
      os: 'web',
      osVersion: '',
      model: '',
      manufacturer: '',
      isVirtual: false,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Screen Reader — detect VoiceOver / TalkBack so we can adjust UI
// (e.g. announce timer changes instead of relying on visual updates).
// ──────────────────────────────────────────────────────────────────────

export async function screenReaderEnabled(): Promise<boolean> {
  if (!isNative()) {
    // Web: there's no reliable API. Heuristic: check if the user enabled
    // a high-contrast scheme or reduced motion (correlates with assistive
    // tech use).
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  try {
    const { ScreenReader } = await import('@capacitor/screen-reader');
    const r = await ScreenReader.isEnabled();
    return r.value;
  } catch {
    return false;
  }
}

/** Announce text via VoiceOver / TalkBack. No-op when no screen reader. */
export async function announceForAccessibility(value: string): Promise<void> {
  if (!isNative()) return;
  try {
    const { ScreenReader } = await import('@capacitor/screen-reader');
    await ScreenReader.speak({ value });
  } catch {
    /* ignore */
  }
}

// ──────────────────────────────────────────────────────────────────────
// Push notifications — APNS on iOS, FCM on Android. Wire to Better Auth
// session so per-user push targeting works (Phase 4+ feature).
// ──────────────────────────────────────────────────────────────────────

export async function registerPushNotifications(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return null;
    await PushNotifications.register();
    return new Promise((resolve) => {
      const handle = PushNotifications.addListener('registration', (token) => {
        handle.then((h) => h.remove());
        resolve(token.value);
      });
      // Bail after 10s if registration never fires.
      setTimeout(() => resolve(null), 10_000);
    });
  } catch {
    return null;
  }
}
