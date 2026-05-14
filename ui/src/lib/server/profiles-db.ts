/**
 * profiles-db — userId-scoped Profile CRUD backed by app.db.profiles.
 *
 * Replaces the flat `data/profiles.json` file with per-user rows. Every
 * call takes a `userId` and only ever sees that user's profiles, so two
 * users can have separate "Default" / "Engineer search" / "Founder search"
 * profile lists that don't collide.
 *
 * One row per (user_id, slug). Composite unique index enforces it at the
 * DB layer; the application code adds the same dedup logic so we surface
 * friendly errors instead of UNIQUE-constraint exceptions.
 *
 * Migration: on first read for a user, if their app.db row count is zero
 * AND the legacy `data/profiles.json` file still exists, we COPY (don't
 * move) the legacy rows under this user. The owner user (the first
 * account created) inherits the legacy data. Other users start empty.
 * A follow-up migration step will eventually delete the legacy file
 * once every caller is verified to use this module.
 *
 * Why "first user inherits legacy"? Single-user installs had no notion of
 * ownership — there's only ever been one user's data. Making the owner
 * inherit gives them a smooth upgrade with no manual import step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { appDb } from './db';
import { profiles } from './db/app-schema';
import { ROOT } from './files';
import { SYSTEM_USER_ID } from './user-context';

const LEGACY_PROFILES_TREE = path.join(ROOT, 'data', 'profiles');
const PER_USER_ROOT = path.join(ROOT, 'data', 'users');

function copyDirSync(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      // Preserve symlinks so the dashboard's active-profile symlinks at
      // repo root keep resolving after migration.
      try {
        const target = fs.readlinkSync(s);
        fs.symlinkSync(target, d);
      } catch {
        // If symlink copy fails (e.g. target invalid), fall back to file copy.
        try {
          fs.copyFileSync(s, d);
        } catch {
          // Both symlink+file-copy failed for this entry — skip and let
          // the upstream migrator surface a more specific error if the
          // resulting profile dir is missing critical files.
        }
      }
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(s, d);
      } catch {
        // Single file copy failed — skip and let the caller verify the
        // copied tree afterwards.
      }
    }
  }
}

/** Copy `data/profiles/{slug}/` to `data/users/{userId}/profiles/{slug}/`
 *  the first time this user references that slug. Idempotent — skips if
 *  the destination tree already exists. */
function maybeCopyProfileTree(userId: string, slug: string): void {
  if (userId === SYSTEM_USER_ID) return;
  const src = path.join(LEGACY_PROFILES_TREE, slug);
  const dst = path.join(PER_USER_ROOT, userId, 'profiles', slug);
  if (fs.existsSync(dst)) return;
  if (!fs.existsSync(src)) return;
  copyDirSync(src, dst);
}

export type ProfileColor =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'pink';

export const PROFILE_COLORS: ProfileColor[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'pink',
];

export type DbProfile = {
  id: string;
  slug: string;
  name: string;
  color: ProfileColor;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

const LEGACY_PROFILES_PATH = path.join(ROOT, 'data', 'profiles.json');

function nowMs(): number {
  return Date.now();
}

/** Slugify a display name into a filesystem-safe kebab-case id. */
export function slugFromName(name: string): string {
  const normalised = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = normalised
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'profile';
}

function uniqueSlug(userId: string, base: string): string {
  const owned = listProfilesForUser(userId);
  const taken = new Set(owned.map((p) => p.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

function newId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function mapRow(row: typeof profiles.$inferSelect): DbProfile {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    color: row.color as ProfileColor,
    isActive: !!row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const LEGACY_CLAIM_FILE = path.join(ROOT, 'data', 'users', '.legacy-claimed');

/** Returns true if this user is the one inheriting the legacy single-user
 *  install data. Only the FIRST user to call this gets `true`; subsequent
 *  users start empty. The decision is persisted in `.legacy-claimed` so
 *  it survives restarts. */
function claimLegacyForUser(userId: string): boolean {
  try {
    fs.mkdirSync(path.dirname(LEGACY_CLAIM_FILE), { recursive: true });
    if (fs.existsSync(LEGACY_CLAIM_FILE)) {
      const claimedBy = fs.readFileSync(LEGACY_CLAIM_FILE, 'utf8').trim();
      return claimedBy === userId;
    }
    fs.writeFileSync(LEGACY_CLAIM_FILE, userId);
    return true;
  } catch {
    return false;
  }
}

/** Idempotent first-read migration: if this user has zero profiles AND
 *  the legacy JSON file exists AND this user is the first one claiming
 *  the legacy data, copy its rows under this user_id. Other users start
 *  with an empty default profile. */
function maybeMigrateLegacy(userId: string): void {
  // Never seed for the system sentinel — those are anonymous reads we
  // don't want producing phantom rows. The endpoint guard already 401s
  // unauthenticated traffic before it reaches the per-user surface.
  if (userId === SYSTEM_USER_ID) return;

  const existing = appDb
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .all();
  if (existing.length > 0) return;

  const inheritsLegacy = claimLegacyForUser(userId);
  if (!inheritsLegacy) {
    // Subsequent users seed a single empty Default profile.
    const now = nowMs();
    appDb
      .insert(profiles)
      .values({
        id: newId(),
        userId,
        slug: 'default',
        name: 'Default',
        color: 'blue',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
    return;
  }
  if (!fs.existsSync(LEGACY_PROFILES_PATH)) {
    // Nothing to migrate; seed a single "Default" profile so the user has
    // somewhere to land.
    const now = nowMs();
    appDb
      .insert(profiles)
      .values({
        id: newId(),
        userId,
        slug: 'default',
        name: 'Default',
        color: 'blue',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }
  try {
    const raw = fs.readFileSync(LEGACY_PROFILES_PATH, 'utf8');
    const parsed = JSON.parse(raw) as {
      activeId?: string;
      profiles?: Array<{
        id?: string;
        name?: string;
        color?: string;
        createdAt?: number;
        lastActiveAt?: number;
      }>;
    };
    const list = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    if (list.length === 0) {
      // Empty file — same fallback as no file.
      const now = nowMs();
      appDb
        .insert(profiles)
        .values({
          id: newId(),
          userId,
          slug: 'default',
          name: 'Default',
          color: 'blue',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return;
    }
    const activeSlug = parsed.activeId ?? list[0]?.id ?? 'default';
    const now = nowMs();
    for (const p of list) {
      if (!p?.id || !p?.name) continue;
      appDb
        .insert(profiles)
        .values({
          id: newId(),
          userId,
          slug: p.id,
          name: p.name,
          color: (p.color as ProfileColor) ?? 'blue',
          isActive: p.id === activeSlug,
          createdAt: p.createdAt ?? now,
          updatedAt: p.lastActiveAt ?? now,
        })
        .onConflictDoNothing()
        .run();
      // Copy the legacy profile tree under this user's path so the
      // first-user-inherits invariant holds at the filesystem level too.
      maybeCopyProfileTree(userId, p.id);
    }
  } catch {
    // If parsing fails, seed a default so the user can keep going.
    const now = nowMs();
    appDb
      .insert(profiles)
      .values({
        id: newId(),
        userId,
        slug: 'default',
        name: 'Default',
        color: 'blue',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export function listProfilesForUser(userId: string): DbProfile[] {
  maybeMigrateLegacy(userId);
  const rows = appDb.select().from(profiles).where(eq(profiles.userId, userId)).all();
  return rows.map(mapRow);
}

export function getActiveProfile(userId: string): DbProfile | undefined {
  const rows = listProfilesForUser(userId);
  return rows.find((p) => p.isActive) ?? rows[0];
}

export function getActiveProfileSlug(userId: string): string {
  return getActiveProfile(userId)?.slug ?? 'default';
}

export function getProfileBySlug(userId: string, slug: string): DbProfile | undefined {
  maybeMigrateLegacy(userId);
  const row = appDb
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.slug, slug)))
    .get();
  return row ? mapRow(row) : undefined;
}

export function setActiveProfile(userId: string, slug: string): DbProfile {
  const target = getProfileBySlug(userId, slug);
  if (!target) throw new Error('Unknown profile: ' + slug);
  const now = nowMs();
  // Clear all isActive flags for this user, then set the target.
  appDb
    .update(profiles)
    .set({ isActive: false, updatedAt: now })
    .where(eq(profiles.userId, userId))
    .run();
  appDb
    .update(profiles)
    .set({ isActive: true, updatedAt: now })
    .where(and(eq(profiles.userId, userId), eq(profiles.slug, slug)))
    .run();
  return { ...target, isActive: true, updatedAt: now };
}

export function createProfileFor(
  userId: string,
  name: string,
  color: ProfileColor = 'blue',
): DbProfile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Profile name is required');
  if (trimmed.length > 60) throw new Error('Profile name is too long (max 60 chars)');
  maybeMigrateLegacy(userId);
  const base = slugFromName(trimmed);
  const now = nowMs();
  const id = newId();

  // Race-safe slug resolution: two simultaneous "Engineer Search" creates
  // (e.g. user's laptop + phone) could both compute "engineer-search" and
  // hit the UNIQUE constraint. We retry inside a transaction-like loop
  // that re-derives the slug after each conflict. SQLite's WAL serializes
  // writes, so each iteration sees the latest state.
  const MAX_ATTEMPTS = 8;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = uniqueSlug(userId, base);
    try {
      // Demote any existing active profile + insert the new one in a
      // single transaction so the activeProfile invariant ("exactly one
      // row with is_active=1 per user_id") holds across crashes.
      appDb.transaction((tx) => {
        tx.update(profiles)
          .set({ isActive: false, updatedAt: now })
          .where(eq(profiles.userId, userId))
          .run();
        tx.insert(profiles)
          .values({
            id,
            userId,
            slug,
            name: trimmed,
            color,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
      return {
        id,
        slug,
        name: trimmed,
        color,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Only retry on UNIQUE conflict — anything else (FK / disk full /
      // permission) should surface to the caller.
      if (!/UNIQUE/i.test(msg) && !/constraint/i.test(msg)) throw e;
      // Loop: uniqueSlug() will read the now-newer state and append
      // -2/-3/... until it finds a free slot.
    }
  }
  throw new Error(
    'Could not allocate a unique profile slug after ' +
      MAX_ATTEMPTS +
      ' attempts. Last error: ' +
      (lastErr instanceof Error ? lastErr.message : String(lastErr)),
  );
}

export function renameProfileFor(userId: string, slug: string, name: string): DbProfile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Profile name is required');
  if (trimmed.length > 60) throw new Error('Profile name is too long (max 60 chars)');
  const target = getProfileBySlug(userId, slug);
  if (!target) throw new Error('Unknown profile: ' + slug);
  const now = nowMs();
  appDb
    .update(profiles)
    .set({ name: trimmed, updatedAt: now })
    .where(and(eq(profiles.userId, userId), eq(profiles.slug, slug)))
    .run();
  return { ...target, name: trimmed, updatedAt: now };
}

export function recolorProfileFor(userId: string, slug: string, color: ProfileColor): DbProfile {
  const target = getProfileBySlug(userId, slug);
  if (!target) throw new Error('Unknown profile: ' + slug);
  const now = nowMs();
  appDb
    .update(profiles)
    .set({ color, updatedAt: now })
    .where(and(eq(profiles.userId, userId), eq(profiles.slug, slug)))
    .run();
  return { ...target, color, updatedAt: now };
}

export function deleteProfileFor(userId: string, slug: string): DbProfile[] {
  const list = listProfilesForUser(userId);
  if (list.length <= 1) {
    throw new Error('Cannot delete the last profile — at least one must exist.');
  }
  if (!list.some((p) => p.slug === slug)) {
    throw new Error('Unknown profile: ' + slug);
  }
  const wasActive = list.find((p) => p.slug === slug)?.isActive ?? false;
  appDb
    .delete(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.slug, slug)))
    .run();
  if (wasActive) {
    // Promote the oldest remaining profile to active.
    const remaining = listProfilesForUser(userId).sort((a, b) => a.createdAt - b.createdAt);
    if (remaining[0]) setActiveProfile(userId, remaining[0].slug);
  }
  return listProfilesForUser(userId);
}
