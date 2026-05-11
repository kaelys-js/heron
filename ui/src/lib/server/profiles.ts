/**
 * Profiles — multi-track career identity support.
 *
 * Each Profile represents a distinct career track (Software Engineering,
 * Electrician, Accounting…) and owns its own per-profile content under
 * `data/profiles/{id}/`: cv.md, profile.yml, portals.yml, _profile.md,
 * pipeline.md, applications.md, scan-history.tsv, gemini-scores.tsv,
 * follow-ups.md, projects.json, article-digest.md, reports/, output/,
 * interview-prep/ (sans story-bank.md which is shared).
 *
 * Shared infra (NOT per-profile):
 *   .env, .playwright-{linkedin,indeed}/, data/sources.json,
 *   data/onboarding-state.json, data/autopilot.json, data/activity.jsonl,
 *   data/issues.jsonl, interview-prep/story-bank.md.
 *
 * Profiles are stored in `data/profiles.json`:
 *   { activeId: string, profiles: Profile[] }
 *
 * The "activeId" is the single source of truth for which profile every
 * read/write defaults to when no explicit profileId is passed.
 *
 * Slug is derived from the display name (kebab-case) at creation time and
 * IMMUTABLE thereafter. The display name can be renamed freely; the slug
 * cannot, since it's the filesystem path component.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const PROFILES_PATH = path.join(ROOT, 'data', 'profiles.json');

export type ProfileColor =
  | 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'orange' | 'pink';

export const PROFILE_COLORS: ProfileColor[] = [
  'blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink',
];

export type Profile = {
  /** Slug — kebab-case derived from display name at creation. Immutable. */
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

/** Default state shape used on first read when the file doesn't exist yet.
 *  Migration (profile-migrate.ts) is responsible for ensuring this file
 *  exists at boot; this is just a safety net for unit tests + fresh installs
 *  that hit a server endpoint before migration completes. */
function defaultState(): ProfilesState {
  return {
    activeId: 'default',
    profiles: [
      {
        id: 'default',
        name: 'Default',
        color: 'blue',
        createdAt: Date.now(),
      },
    ],
  };
}

export function readProfiles(): ProfilesState {
  try {
    if (!fs.existsSync(PROFILES_PATH)) {
      // Don't write a default here — let migration handle the first-run
      // bootstrap so we don't race with it.
      return defaultState();
    }
    const raw = fs.readFileSync(PROFILES_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProfilesState>;
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    const valid = profiles.filter(
      (p): p is Profile =>
        typeof p?.id === 'string' &&
        typeof p?.name === 'string' &&
        typeof p?.color === 'string' &&
        typeof p?.createdAt === 'number',
    );
    if (valid.length === 0) return defaultState();
    const activeId = valid.find((p) => p.id === parsed.activeId)?.id ?? valid[0].id;
    return { activeId, profiles: valid };
  } catch {
    return defaultState();
  }
}

export function writeProfiles(state: ProfilesState): void {
  fs.mkdirSync(path.dirname(PROFILES_PATH), { recursive: true });
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(state, null, 2) + '\n');
}

export function getActiveProfileId(): string {
  return readProfiles().activeId;
}

export function setActiveProfileId(id: string): ProfilesState {
  const state = readProfiles();
  if (!state.profiles.some((p) => p.id === id)) {
    throw new Error('Unknown profile: ' + id);
  }
  const next: ProfilesState = {
    activeId: id,
    profiles: state.profiles.map((p) =>
      p.id === id ? { ...p, lastActiveAt: Date.now() } : p,
    ),
  };
  writeProfiles(next);
  return next;
}

export function getProfile(id: string): Profile | undefined {
  return readProfiles().profiles.find((p) => p.id === id);
}

export function listProfiles(): Profile[] {
  return readProfiles().profiles;
}

/** Slugify a display name into a filesystem-safe kebab-case id. Strips
 *  diacritics, lowercases, replaces non-alphanumerics with `-`, collapses
 *  runs, and trims. Returns `'profile'` if the result is empty (rare). */
export function slugFromName(name: string): string {
  // NFD splits letters from diacritic marks so we can strip the marks
  // (e.g. café → cafe).
  const normalised = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = normalised
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'profile';
}

/** Make a slug unique against the existing profiles list by appending
 *  `-2`, `-3`, … until no collision. */
function uniqueSlug(base: string, existing: Profile[]): string {
  const taken = new Set(existing.map((p) => p.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  return base + '-' + i;
}

export function createProfile(name: string, color: ProfileColor = 'blue'): Profile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Profile name is required');
  if (trimmed.length > 60) throw new Error('Profile name is too long (max 60 chars)');
  const state = readProfiles();
  const id = uniqueSlug(slugFromName(trimmed), state.profiles);
  const profile: Profile = {
    id,
    name: trimmed,
    color,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  const next: ProfilesState = {
    activeId: id, // becomes the new active profile
    profiles: [...state.profiles, profile],
  };
  writeProfiles(next);
  return profile;
}

export function renameProfile(id: string, name: string): Profile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Profile name is required');
  if (trimmed.length > 60) throw new Error('Profile name is too long (max 60 chars)');
  const state = readProfiles();
  const target = state.profiles.find((p) => p.id === id);
  if (!target) throw new Error('Unknown profile: ' + id);
  const next: ProfilesState = {
    ...state,
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
  };
  writeProfiles(next);
  return next.profiles.find((p) => p.id === id)!;
}

/** Recolor a profile. Returns updated profile. */
export function recolorProfile(id: string, color: ProfileColor): Profile {
  const state = readProfiles();
  const target = state.profiles.find((p) => p.id === id);
  if (!target) throw new Error('Unknown profile: ' + id);
  const next: ProfilesState = {
    ...state,
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, color } : p)),
  };
  writeProfiles(next);
  return next.profiles.find((p) => p.id === id)!;
}

/**
 * Remove a profile from the list. Returns the new state.
 *
 * Refuses to delete the last profile (would leave the system in an invalid
 * zero-profile state). If the deleted profile was active, the first
 * remaining profile becomes active.
 *
 * NOTE: This only updates `data/profiles.json`. Actually deleting the
 * profile's content directory (`data/profiles/{id}/`) is the caller's job,
 * since the policy varies (the danger-zone reset wipes; a "remove from list
 * but keep files" mode is possible too).
 */
export function deleteProfile(id: string): ProfilesState {
  const state = readProfiles();
  if (state.profiles.length <= 1) {
    throw new Error('Cannot delete the last profile — at least one must exist.');
  }
  if (!state.profiles.some((p) => p.id === id)) {
    throw new Error('Unknown profile: ' + id);
  }
  const remaining = state.profiles.filter((p) => p.id !== id);
  const activeId = state.activeId === id ? remaining[0].id : state.activeId;
  const next: ProfilesState = { activeId, profiles: remaining };
  writeProfiles(next);
  return next;
}
