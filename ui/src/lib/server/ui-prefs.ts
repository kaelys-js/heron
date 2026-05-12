/**
 * ui-prefs — per-machine UI preferences (single-user for now).
 *
 * Storage: data/ui-prefs.json (NOT per-profile — these are user-of-the-
 * machine settings: appearance, theme, displayName, avatar path,
 * notification toggles. Per-profile data stays under data/profiles/).
 *
 * Multi-user support is explicitly OUT of scope. When that lands, this
 * becomes per-user instead of per-machine — the file format is forward-
 * compatible (object keyed by userId).
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const PREFS_FILE = path.join(ROOT, 'data', 'ui-prefs.json');
const AVATAR_DIR = path.join(ROOT, 'data', 'avatars');

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'default' | 'fuchsia' | 'emerald' | 'amber' | 'blue' | 'rose';

export const APPEARANCE_OPTIONS: Appearance[] = ['system', 'light', 'dark'];
export const THEME_OPTIONS: Theme[] = ['default', 'fuchsia', 'emerald', 'amber', 'blue', 'rose'];

export type NotificationPrefs = {
  /** OS-level browser notifications (handled by PushNotificationsToggle). */
  os: {
    error: boolean;
    warn: boolean;
    success: boolean;
    info: boolean;
  };
  /** In-app toast notifications. Defaults match the existing notification
   *  store behavior so flipping off the toggle silences toasts too. */
  toast: {
    error: boolean;
    warn: boolean;
    success: boolean;
    info: boolean;
  };
  /** Per-event-source mutes. Source = 'auto-eval' | 'scan' | 'apply-*' | etc.
   *  When a source is in this list it's NEVER shown regardless of level. */
  mutedSources: string[];
};

export type UiPrefs = {
  /** Friendly name shown in the topbar + sidebar. */
  displayName?: string;
  /** Relative path under data/avatars/ — e.g. "user.png". Image served via
   *  /api/profile/avatar GET. Null/undefined = default initials avatar. */
  avatarPath?: string;
  appearance: Appearance;
  theme: Theme;
  notifications: NotificationPrefs;
  /** ms epoch of last write — used by the staleness/version check. */
  updatedAt: number;
};

export const DEFAULT_PREFS: UiPrefs = {
  appearance: 'system',
  theme: 'default',
  notifications: {
    os: { error: true, warn: true, success: true, info: false },
    toast: { error: true, warn: true, success: true, info: true },
    mutedSources: [],
  },
  updatedAt: 0,
};

export function readPrefs(): UiPrefs {
  try {
    if (!fs.existsSync(PREFS_FILE)) return { ...DEFAULT_PREFS };
    const raw = fs.readFileSync(PREFS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    // Merge with defaults so missing fields don't break the UI.
    return {
      displayName: parsed.displayName,
      avatarPath: parsed.avatarPath,
      appearance: parsed.appearance ?? DEFAULT_PREFS.appearance,
      theme: parsed.theme ?? DEFAULT_PREFS.theme,
      notifications: {
        os: { ...DEFAULT_PREFS.notifications.os, ...(parsed.notifications?.os ?? {}) },
        toast: { ...DEFAULT_PREFS.notifications.toast, ...(parsed.notifications?.toast ?? {}) },
        mutedSources: parsed.notifications?.mutedSources ?? [],
      },
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(patch: Partial<UiPrefs>): UiPrefs {
  const cur = readPrefs();
  const next: UiPrefs = {
    ...cur,
    ...patch,
    notifications: {
      ...cur.notifications,
      ...(patch.notifications ?? {}),
      os: { ...cur.notifications.os, ...(patch.notifications?.os ?? {}) },
      toast: { ...cur.notifications.toast, ...(patch.notifications?.toast ?? {}) },
      mutedSources: patch.notifications?.mutedSources ?? cur.notifications.mutedSources,
    },
    updatedAt: Date.now(),
  };
  fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Avatar upload — store under data/avatars/. Returns the relative path
 *  the UI references. We accept a buffer + content-type; the caller
 *  enforces size limits + sanitizes filename. */
export function saveAvatar(
  buffer: Buffer,
  contentType: string,
): { ok: boolean; path?: string; error?: string } {
  const ALLOWED = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
  ]);
  const ext = ALLOWED.get(contentType);
  if (!ext) return { ok: false, error: 'Unsupported content-type: ' + contentType };
  if (buffer.length > 2 * 1024 * 1024) return { ok: false, error: 'Avatar must be ≤2MB' };
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  // Stable filename — overwrites prior avatar so we don't leak old uploads.
  const filename = 'avatar.' + ext;
  const full = path.join(AVATAR_DIR, filename);
  fs.writeFileSync(full, buffer);
  // Clear other extensions (the user might have switched png → jpg).
  for (const [, otherExt] of ALLOWED) {
    if (otherExt === ext) continue;
    const other = path.join(AVATAR_DIR, 'avatar.' + otherExt);
    if (fs.existsSync(other)) {
      try {
        fs.unlinkSync(other);
      } catch {}
    }
  }
  // Save the path into ui-prefs.json.
  writePrefs({ avatarPath: 'avatars/' + filename });
  return { ok: true, path: 'avatars/' + filename };
}

/** Read the avatar bytes back (for the /api/profile/avatar GET handler). */
export function readAvatar(): { buffer: Buffer; contentType: string } | null {
  const prefs = readPrefs();
  if (!prefs.avatarPath) return null;
  const full = path.join(ROOT, 'data', prefs.avatarPath);
  if (!fs.existsSync(full)) return null;
  const ext = path.extname(full).slice(1).toLowerCase();
  const contentType =
    ext === 'png'
      ? 'image/png'
      : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
  return { buffer: fs.readFileSync(full), contentType };
}

/** Drop the avatar (revert to initials). */
export function clearAvatar(): void {
  const prefs = readPrefs();
  if (prefs.avatarPath) {
    const full = path.join(ROOT, 'data', prefs.avatarPath);
    try {
      fs.unlinkSync(full);
    } catch {}
  }
  writePrefs({ avatarPath: undefined });
}
