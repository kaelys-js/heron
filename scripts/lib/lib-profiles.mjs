// lib-profiles.mjs — Shared user+profile path helpers for MJS scripts.
//
// Mirrors profile-paths.ts (TS) and lib_profiles.py (Python). Each MJS
// script imports this to resolve per-user, per-profile file paths.
//
// MULTI-USER LAYOUT:
//
//   data/users/{userId}/profiles/{slug}/cv.md
//   data/users/{userId}/profiles/{slug}/profile.yml
//   data/users/{userId}/profiles/{slug}/portals.yml
//   data/users/{userId}/profiles/{slug}/applications.md
//   data/users/{userId}/profiles/{slug}/pipeline.md
//   …
//
// LEGACY SINGLE-USER LAYOUT (still works for pre-multi-user installs):
//
//   data/profiles/{slug}/cv.md
//   data/profiles/{slug}/profile.yml
//   …
//
// Scripts get the userId from the dashboard via either:
//   • --user <userId>   CLI flag (preferred)
//   • CAREER_OPS_USER_ID env var (set by the orchestrator when it spawns)
//
// When neither is set, lib-profiles falls back to the legacy data/profiles/
// root. This lets old single-user workflows keep working.
//
// Usage:
//   import { resolveUserArg, resolveProfileArg, profilePath } from './lib-profiles.mjs';
//
//   const userId    = resolveUserArg();
//   const profileId = resolveProfileArg();
//   const pipelineMd = profilePath(profileId, 'pipeline', userId);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = __dirname;
const PROFILES_JSON = path.join(ROOT, 'data', 'profiles.json');
const LEGACY_PROFILES_ROOT = path.join(ROOT, 'data', 'profiles');
const USERS_ROOT = path.join(ROOT, 'data', 'users');

/** SYSTEM_USER_ID matches the TS-side sentinel. When the script is invoked
 *  without --user (legacy single-user mode), this is what `resolveUserArg`
 *  returns. `userProfilesRoot` then maps it back to LEGACY_PROFILES_ROOT
 *  so the file paths still resolve correctly. */
export const SYSTEM_USER_ID = '__system__';

const KINDS = {
  'cv-md': 'cv.md',
  'profile-yml': 'profile.yml',
  'profile-md': '_profile.md',
  'portals-yml': 'portals.yml',
  'article-digest': 'article-digest.md',
  pipeline: 'pipeline.md',
  applications: 'applications.md',
  'scan-history': 'scan-history.tsv',
  'gemini-scores': 'gemini-scores.tsv',
  'follow-ups': 'follow-ups.md',
  'projects-json': 'projects.json',
  'profile-dir': '',
  'reports-dir': 'reports',
  'output-dir': 'output',
  'interview-prep-dir': 'interview-prep',
};

/** Where this user's profile tree lives. SYSTEM_USER_ID maps to the
 *  legacy `data/profiles/` root so single-user mode still works. */
function userProfilesRoot(userId) {
  if (userId === SYSTEM_USER_ID) return LEGACY_PROFILES_ROOT;
  return path.join(USERS_ROOT, userId, 'profiles');
}

export function readProfiles() {
  try {
    const text = fs.readFileSync(PROFILES_JSON, 'utf8');
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'activeId' in parsed &&
      Array.isArray(parsed.profiles)
    ) {
      return parsed;
    }
  } catch {
    // fallthrough to default
  }
  return {
    activeId: 'default',
    profiles: [{ id: 'default', name: 'Default', color: 'blue' }],
  };
}

export function getActiveProfileId() {
  return readProfiles().activeId || 'default';
}

export function listProfileIds() {
  return readProfiles()
    .profiles.map((p) => p.id)
    .filter(Boolean);
}

/** Resolve a path for the named profile + user. `userId` falls back to
 *  the SYSTEM_USER_ID sentinel (legacy single-user layout). */
export function profilePath(profileId, kind, userId = SYSTEM_USER_ID) {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error(`profilePath: profileId required (got ${JSON.stringify(profileId)})`);
  }
  if (profileId.includes('/') || profileId.includes('\\') || profileId.includes('..')) {
    throw new Error(`profilePath: invalid profileId (path traversal): ${profileId}`);
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error(`profilePath: userId required (got ${JSON.stringify(userId)})`);
  }
  if (userId.includes('/') || userId.includes('\\') || userId.includes('..')) {
    throw new Error(`profilePath: invalid userId (path traversal): ${userId}`);
  }
  if (!(kind in KINDS)) {
    throw new Error(`profilePath: unknown kind ${kind}. Valid: ${Object.keys(KINDS).join(', ')}`);
  }
  const base = path.join(userProfilesRoot(userId), profileId);
  const rel = KINDS[kind];
  return rel === '' ? base : path.join(base, rel);
}

export function ensureProfileDirs(profileId, userId = SYSTEM_USER_ID) {
  fs.mkdirSync(profilePath(profileId, 'profile-dir', userId), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'reports-dir', userId), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'output-dir', userId), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'interview-prep-dir', userId), { recursive: true });
}

/**
 * Resolve a `--profile <slug>` arg value (string or undefined) to an actual
 * profile id. Falls back to the active profile. Exits with code 2 if the
 * value names a profile that doesn't exist.
 */
export function resolveProfileArg(value) {
  if (value == null) return getActiveProfileId();
  const known = listProfileIds();
  if (!known.includes(value)) {
    console.error(
      `ERROR: unknown profile ${JSON.stringify(value)}. Known: ${JSON.stringify(known)}`,
    );
    process.exit(2);
  }
  return value;
}

/**
 * Parse a --profile arg from process.argv. Returns the resolved slug.
 * Tolerant of `--profile=<slug>` and `--profile <slug>` forms.
 */
export function profileFromArgv(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' && i + 1 < argv.length) {
      return resolveProfileArg(argv[i + 1]);
    }
    if (a.startsWith('--profile=')) {
      return resolveProfileArg(a.slice('--profile='.length));
    }
  }
  return resolveProfileArg(undefined);
}

/**
 * Resolve a `--user <userId>` arg or CAREER_OPS_USER_ID env var. Returns
 * SYSTEM_USER_ID when neither is set (legacy single-user fallback).
 *
 * Path-traversal guard: any value containing /, \, or .. is rejected with
 * exit code 2 to avoid spawned scripts escaping their assigned user tree.
 */
export function resolveUserArg(value) {
  let id = value;
  if (id == null) id = process.env.CAREER_OPS_USER_ID;
  if (id == null || id === '') return SYSTEM_USER_ID;
  if (typeof id !== 'string') {
    console.error(`ERROR: --user must be a string, got ${typeof id}`);
    process.exit(2);
  }
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    console.error(`ERROR: --user has invalid characters: ${JSON.stringify(id)}`);
    process.exit(2);
  }
  return id;
}

/** Parse a --user arg from process.argv. Falls back to the env var. */
export function userFromArgv(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user' && i + 1 < argv.length) return resolveUserArg(argv[i + 1]);
    if (a.startsWith('--user=')) return resolveUserArg(a.slice('--user='.length));
  }
  return resolveUserArg(undefined);
}
