/** Profiles -- multi-track career identity facade. Multi-user installs
 *  store rows in app.db.profiles (one per (user_id, slug)); see
 *  profiles-db.ts for the userId-aware CRUD. This file is the legacy
 *  single-arg facade -- readProfiles, createProfile, setActiveProfileId,
 *  etc. route through profiles-db.ts scoped to the request's current
 *  user via user-context.ts's AsyncLocalStorage.
 *  The indirection lets ~30 legacy call sites migrate incrementally
 *  rather than threading userId through every signature at once. */
import { currentUserIdOrDefault } from './user-context';
import {
  listProfilesForUser,
  getActiveProfile,
  getProfileBySlug,
  setActiveProfile,
  createProfileFor,
  renameProfileFor,
  recolorProfileFor,
  deleteProfileFor,
  slugFromName as slugFromNameDb,
  PROFILE_COLORS as PROFILE_COLORS_DB,
  type ProfileColor as ProfileColorDb,
  type DbProfile,
} from './profiles-db';

export type ProfileColor = ProfileColorDb;
export const PROFILE_COLORS = PROFILE_COLORS_DB;

export type Profile = {
  /** Slug -- kebab-case derived from display name at creation. Immutable. */
  id: string;
  /** Human-readable display name. Renamable. */
  name: string;
  color: ProfileColor;
  createdAt: number;
  lastActiveAt?: number;
};

export type ProfilesState = {
  activeId: string;
  profiles: Profile[];
};

function dbToLegacy(p: DbProfile): Profile {
  return {
    id: p.slug,
    name: p.name,
    color: p.color,
    createdAt: p.createdAt,
    lastActiveAt: p.updatedAt,
  };
}

export function readProfiles(): ProfilesState {
  const userId = currentUserIdOrDefault();
  const rows = listProfilesForUser(userId);
  const active = getActiveProfile(userId);
  return {
    activeId: active?.slug ?? rows[0]?.slug ?? 'default',
    profiles: rows.map(dbToLegacy),
  };
}

/** Legacy callers that mutate the whole state at once still work, but
 *  the recommended API is one of the targeted helpers below. */
export function writeProfiles(_state: ProfilesState): void {
  // No-op: the DB-backed state is updated by the targeted helpers
  // (setActiveProfileId, createProfile, renameProfile, …) instead of a
  // bulk write. Keep the function so existing imports don't break.
}

export function getActiveProfileId(): string {
  return readProfiles().activeId;
}

export function setActiveProfileId(id: string): ProfilesState {
  const userId = currentUserIdOrDefault();
  setActiveProfile(userId, id);
  return readProfiles();
}

export function getProfile(id: string): Profile | undefined {
  const userId = currentUserIdOrDefault();
  const row = getProfileBySlug(userId, id);
  return row ? dbToLegacy(row) : undefined;
}

export function listProfiles(): Profile[] {
  return readProfiles().profiles;
}

export const slugFromName = slugFromNameDb;

export function createProfile(name: string, color: ProfileColor = 'blue'): Profile {
  const userId = currentUserIdOrDefault();
  const p = createProfileFor(userId, name, color);
  return dbToLegacy(p);
}

export function renameProfile(id: string, name: string): Profile {
  const userId = currentUserIdOrDefault();
  const p = renameProfileFor(userId, id, name);
  return dbToLegacy(p);
}

export function recolorProfile(id: string, color: ProfileColor): Profile {
  const userId = currentUserIdOrDefault();
  const p = recolorProfileFor(userId, id, color);
  return dbToLegacy(p);
}

export function deleteProfile(id: string): ProfilesState {
  const userId = currentUserIdOrDefault();
  deleteProfileFor(userId, id);
  return readProfiles();
}
