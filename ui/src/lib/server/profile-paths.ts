/**
 * profile-paths — single source of truth for "where does file X for
 * profile Y live on disk".
 *
 * Every read/write helper in lib/server/* that touches a per-profile file
 * must go through `profilePath(profileId, kind)`. This makes it impossible
 * to accidentally cross-contaminate profile data and keeps the layout
 * change localized to one module.
 *
 * Layout (single profile shown; same shape for every profile):
 *
 *   data/profiles/{slug}/
 *     ├── cv.md
 *     ├── profile.yml
 *     ├── _profile.md             ← per-profile copy of modes/_profile.md
 *     ├── portals.yml
 *     ├── article-digest.md
 *     ├── pipeline.md
 *     ├── applications.md
 *     ├── scan-history.tsv
 *     ├── gemini-scores.tsv
 *     ├── follow-ups.md
 *     ├── projects.json
 *     ├── reports/
 *     ├── output/                 ← incl. cv-general.pdf for LinkedIn Easy Apply
 *     └── interview-prep/         ← per-company .md files (story-bank.md stays shared)
 *
 * Files NOT covered here (shared across profiles, stay at original paths):
 *   .env                          ← shared API keys + IMAP creds
 *   .playwright-{linkedin,indeed}/← shared auth sessions
 *   data/profiles.json            ← THIS file itself + active selection
 *   data/sources.json             ← shared source connection state
 *   data/onboarding-state.json    ← shared wizard state
 *   data/autopilot.json           ← shared scheduler config
 *   data/activity.jsonl           ← shared event log
 *   data/issues.jsonl             ← shared open-issues feed
 *   data/inbox-mbox/              ← shared mbox dropbox for scan-email.mjs
 *   data/followup-cache.json      ← derived cache
 *   data/patterns-cache.json      ← derived cache
 *   data/insights-cache.json      ← derived cache
 *   interview-prep/story-bank.md  ← shared STAR-story bank
 *
 * Why a single helper rather than path constants per kind:
 *  - The profileId is dynamic. Hardcoding `path.join(ROOT, 'data', 'profiles', 'default', 'cv.md')`
 *    in every caller forces them to also import readProfiles → defeating the point.
 *  - Adding a new per-profile file later is a one-line change here, not a hunt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

export type ProfileFileKind =
  // Top-level user content
  | 'cv-md'
  | 'profile-yml'
  | 'profile-md'              // per-profile copy of modes/_profile.md
  | 'portals-yml'
  | 'article-digest'
  // Per-profile tracker / scanner / scoring data
  | 'pipeline'
  | 'applications'
  | 'scan-history'
  | 'gemini-scores'
  | 'follow-ups'
  | 'projects-json'
  // Per-profile directories
  | 'profile-dir'              // the root of this profile's content
  | 'reports-dir'
  | 'output-dir'
  | 'interview-prep-dir';

const PROFILES_ROOT = path.join(ROOT, 'data', 'profiles');

/**
 * Resolve the on-disk path of a per-profile file or directory.
 *
 * Caller MUST pass a real profileId — this function does NOT default to
 * the active profile. Defaulting happens at the helper-function level
 * (readProfile, readPortals, etc.) so a missing-profileId bug surfaces
 * loudly here rather than silently writing to the active profile's files.
 */
export function profilePath(profileId: string, kind: ProfileFileKind): string {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error('profilePath: profileId is required (got ' + JSON.stringify(profileId) + ')');
  }
  // Guard against path traversal — profileId comes from data/profiles.json
  // which we control, but it's good hygiene to reject anything that could
  // escape the profiles dir.
  if (profileId.includes('/') || profileId.includes('\\') || profileId.includes('..')) {
    throw new Error('profilePath: invalid profileId (path-traversal attempt): ' + profileId);
  }
  const base = path.join(PROFILES_ROOT, profileId);
  switch (kind) {
    case 'profile-dir':         return base;
    case 'cv-md':               return path.join(base, 'cv.md');
    case 'profile-yml':         return path.join(base, 'profile.yml');
    case 'profile-md':          return path.join(base, '_profile.md');
    case 'portals-yml':         return path.join(base, 'portals.yml');
    case 'article-digest':      return path.join(base, 'article-digest.md');
    case 'pipeline':            return path.join(base, 'pipeline.md');
    case 'applications':        return path.join(base, 'applications.md');
    case 'scan-history':        return path.join(base, 'scan-history.tsv');
    case 'gemini-scores':       return path.join(base, 'gemini-scores.tsv');
    case 'follow-ups':          return path.join(base, 'follow-ups.md');
    case 'projects-json':       return path.join(base, 'projects.json');
    case 'reports-dir':         return path.join(base, 'reports');
    case 'output-dir':          return path.join(base, 'output');
    case 'interview-prep-dir':  return path.join(base, 'interview-prep');
  }
}

/** Make sure the profile directory + its standard subdirs exist. Idempotent. */
export function ensureProfileDirs(profileId: string): void {
  fs.mkdirSync(profilePath(profileId, 'profile-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'reports-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'output-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'interview-prep-dir'), { recursive: true });
}

/** Returns true when the profile directory exists on disk. Cheap check. */
export function profileDirExists(profileId: string): boolean {
  return fs.existsSync(profilePath(profileId, 'profile-dir'));
}

/**
 * Shortcut for `profilePath(getActiveProfileId(), kind)`. Used by code that
 * doesn't have an explicit profileId context (most server endpoints today)
 * and just wants the active profile's path. New code that DOES have a
 * profileId in scope should prefer `profilePath(id, kind)` directly so the
 * call site is explicit about which profile it targets.
 */
import { getActiveProfileId } from './profiles';
export function activePath(kind: ProfileFileKind): string {
  return profilePath(getActiveProfileId(), kind);
}
