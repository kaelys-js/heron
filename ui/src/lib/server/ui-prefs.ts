/** ui-prefs -- per-USER UI preferences in app.db.ui_prefs (PK user_id).
 *  Row holds appearance (light/dark/system), theme, display name, avatar
 *  path, notification toggles. On first read for a user with no row, if
 *  legacy data/ui-prefs.json is present we copy it under that user_id
 *  (first-user-inherits, same as profiles).
 *  Avatars on FS at data/avatars/{userId}/avatar.{ext} (per-user dir so
 *  uploads can't clobber each other); legacy "avatars/avatar.png" is
 *  auto-migrated by readAvatar(). Public API is zero-arg -- the acting
 *  user resolves via hooks.server.ts's AsyncLocalStorage context. */

import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { appDb } from './db';
import { uiPrefs } from './db/app-schema';
import { ROOT } from './files';
import { currentUserIdOrDefault, SYSTEM_USER_ID } from './user-context';

const LEGACY_PREFS_FILE = path.join(ROOT, 'data', 'ui-prefs.json');
const AVATAR_DIR = path.join(ROOT, 'data', 'avatars');

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'default' | 'fuchsia' | 'emerald' | 'amber' | 'blue' | 'rose';

export const APPEARANCE_OPTIONS: Appearance[] = ['system', 'light', 'dark'];
export const THEME_OPTIONS: Theme[] = ['default', 'fuchsia', 'emerald', 'amber', 'blue', 'rose'];

export type NotificationPrefs = {
  os: {
    error: boolean;
    warn: boolean;
    success: boolean;
    info: boolean;
  };
  toast: {
    error: boolean;
    warn: boolean;
    success: boolean;
    info: boolean;
  };
  mutedSources: string[];
};

export type UiPrefs = {
  displayName?: string;
  avatarPath?: string;
  appearance: Appearance;
  theme: Theme;
  notifications: NotificationPrefs;
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

function parseNotifications(raw: string | null | undefined): NotificationPrefs {
  if (!raw) return DEFAULT_PREFS.notifications;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      os: { ...DEFAULT_PREFS.notifications.os, ...(parsed.os ?? {}) },
      toast: { ...DEFAULT_PREFS.notifications.toast, ...(parsed.toast ?? {}) },
      mutedSources: Array.isArray(parsed.mutedSources) ? parsed.mutedSources : [],
    };
  } catch {
    return DEFAULT_PREFS.notifications;
  }
}

function maybeMigrateLegacy(userId: string): void {
  if (userId === SYSTEM_USER_ID) return;
  const existing = appDb
    .select({ userId: uiPrefs.userId })
    .from(uiPrefs)
    .where(eq(uiPrefs.userId, userId))
    .get();
  if (existing) return;
  if (!fs.existsSync(LEGACY_PREFS_FILE)) return;
  try {
    const raw = fs.readFileSync(LEGACY_PREFS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    appDb
      .insert(uiPrefs)
      .values({
        userId,
        displayName: parsed.displayName ?? null,
        avatarPath: parsed.avatarPath ?? null,
        appearance: parsed.appearance ?? DEFAULT_PREFS.appearance,
        theme: parsed.theme ?? DEFAULT_PREFS.theme,
        notifications: JSON.stringify({
          os: {
            ...DEFAULT_PREFS.notifications.os,
            ...(parsed.notifications?.os ?? {}),
          },
          toast: {
            ...DEFAULT_PREFS.notifications.toast,
            ...(parsed.notifications?.toast ?? {}),
          },
          mutedSources: parsed.notifications?.mutedSources ?? [],
        }),
        updatedAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  } catch {
    // Legacy file unparseable -- leave it alone and let the user start fresh.
  }
}

function readPrefsForUser(userId: string): UiPrefs {
  if (userId === SYSTEM_USER_ID) return { ...DEFAULT_PREFS };
  maybeMigrateLegacy(userId);
  const row = appDb.select().from(uiPrefs).where(eq(uiPrefs.userId, userId)).get();
  if (!row) return { ...DEFAULT_PREFS };
  return {
    displayName: row.displayName ?? undefined,
    avatarPath: row.avatarPath ?? undefined,
    appearance: (row.appearance as Appearance) ?? DEFAULT_PREFS.appearance,
    theme: (row.theme as Theme) ?? DEFAULT_PREFS.theme,
    notifications: parseNotifications(row.notifications),
    updatedAt: row.updatedAt ?? 0,
  };
}

function writePrefsForUser(userId: string, patch: Partial<UiPrefs>): UiPrefs {
  if (userId === SYSTEM_USER_ID) return { ...DEFAULT_PREFS };
  const cur = readPrefsForUser(userId);
  const merged: UiPrefs = {
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
  const existing = appDb
    .select({ userId: uiPrefs.userId })
    .from(uiPrefs)
    .where(eq(uiPrefs.userId, userId))
    .get();
  const notifJson = JSON.stringify(merged.notifications);
  if (existing) {
    appDb
      .update(uiPrefs)
      .set({
        displayName: merged.displayName ?? null,
        avatarPath: merged.avatarPath ?? null,
        appearance: merged.appearance,
        theme: merged.theme,
        notifications: notifJson,
        updatedAt: merged.updatedAt,
      })
      .where(eq(uiPrefs.userId, userId))
      .run();
  } else {
    appDb
      .insert(uiPrefs)
      .values({
        userId,
        displayName: merged.displayName ?? null,
        avatarPath: merged.avatarPath ?? null,
        appearance: merged.appearance,
        theme: merged.theme,
        notifications: notifJson,
        updatedAt: merged.updatedAt,
      })
      .run();
  }
  return merged;
}

export function readPrefs(): UiPrefs {
  return readPrefsForUser(currentUserIdOrDefault());
}

export function writePrefs(patch: Partial<UiPrefs>): UiPrefs {
  return writePrefsForUser(currentUserIdOrDefault(), patch);
}

/** Per-user avatar directory. Existing single-user installs had
 *  `data/avatars/avatar.png`; multi-user installs use
 *  `data/avatars/{userId}/avatar.png`. */
function userAvatarDir(userId: string): string {
  return path.join(AVATAR_DIR, userId);
}

export function saveAvatar(
  buffer: Buffer,
  contentType: string,
): { ok: boolean; path?: string; error?: string } {
  const userId = currentUserIdOrDefault();
  if (userId === SYSTEM_USER_ID) {
    return { ok: false, error: 'unauthenticated' };
  }
  const ALLOWED = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
  ]);
  const ext = ALLOWED.get(contentType);
  if (!ext) return { ok: false, error: 'Unsupported content-type: ' + contentType };
  if (buffer.length > 2 * 1024 * 1024) return { ok: false, error: 'Avatar must be ≤2MB' };
  const dir = userAvatarDir(userId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = 'avatar.' + ext;
  const full = path.join(dir, filename);
  fs.writeFileSync(full, buffer);
  for (const [, otherExt] of ALLOWED) {
    if (otherExt === ext) continue;
    const other = path.join(dir, 'avatar.' + otherExt);
    if (fs.existsSync(other)) {
      try {
        fs.unlinkSync(other);
      } catch {
        // Stale avatar variant unlink failed -- non-fatal, the new variant
        // is already written so reads will pick it up. Storage drift is
        // bounded (max 1 stale file per user) and the next upload will
        // try again.
      }
    }
  }
  const relPath = 'avatars/' + userId + '/' + filename;
  writePrefs({ avatarPath: relPath });
  return { ok: true, path: relPath };
}

export function readAvatar(): { buffer: Buffer; contentType: string } | null {
  const userId = currentUserIdOrDefault();
  if (userId === SYSTEM_USER_ID) return null;
  const prefs = readPrefs();
  if (!prefs.avatarPath) return null;
  // Defence-in-depth: the stored avatarPath MUST live under this user's
  // avatar dir. Without this check, a poisoned `ui_prefs.avatar_path`
  // (e.g. crafted via a stolen session before the schema lock-down
  // landed) could read another user's avatar bytes. We enforce both:
  //   (a) the path resolves under `data/avatars/{userId}/`
  //   (b) the resolved real path doesn't escape via symlink
  const expectedPrefix = 'avatars/' + userId + '/';
  if (!prefs.avatarPath.startsWith(expectedPrefix)) return null;
  const full = path.resolve(ROOT, 'data', prefs.avatarPath);
  const userDir = path.resolve(ROOT, 'data', 'avatars', userId);
  // Ensure `full` is INSIDE `userDir` after symlink resolution. We use
  // realpath only if the file exists; otherwise fall back to the prefix
  // check above (which catches the "no file but malicious path" case).
  if (!fs.existsSync(full)) return null;
  let realFull: string;
  let realDir: string;
  try {
    realFull = fs.realpathSync(full);
    realDir = fs.realpathSync(userDir);
  } catch {
    return null;
  }
  if (!realFull.startsWith(realDir + path.sep) && realFull !== realDir) return null;
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

export function clearAvatar(): void {
  const prefs = readPrefs();
  if (prefs.avatarPath) {
    const full = path.join(ROOT, 'data', prefs.avatarPath);
    try {
      fs.unlinkSync(full);
    } catch {
      // File already gone or permissions issue -- proceed with the
      // pref clear anyway so the UI shows no avatar.
    }
  }
  writePrefs({ avatarPath: undefined });
}
