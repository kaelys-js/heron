/**
 * profile-paths -- single source of truth for "where does file X for
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
import { currentUserIdOrDefault, SYSTEM_USER_ID } from './user-context';

export type ProfileFileKind =
  // Top-level user content
  | 'cv-md'
  | 'profile-yml'
  | 'profile-md' // per-profile copy of modes/_profile.md
  | 'portals-yml'
  | 'article-digest'
  // Per-profile tracker / scanner / scoring data
  | 'pipeline'
  | 'applications'
  | 'scan-history'
  | 'gemini-scores'
  | 'follow-ups'
  | 'projects-json'
  // Stage-tracking sidecars (Phase I -- post-apply pipeline).
  // Stored as JSON per-profile because applications.md is a markdown
  // file with fixed columns -- we'd break backward-compat by widening it.
  | 'stage-state-json' // job_id → {stageHistory, lastTouchAt, nextActionDue}
  | 'interviewers-json' // job_id → [{name, title, linkedin, scheduledAt, ...}]
  | 'offers-json' // job_id → {base, bonus, equity, benchmark, counter, ...}
  | 'linkedin-audit-json' // latest scraped LinkedIn snapshot + findings
  | 'inbound-leads-jsonl' // append-only log of inbound recruiter messages (email + LinkedIn DM)
  | 'inbound-threads-json' // per-lead thread state machine (engaged / went-silent / closed)
  // Per-profile directories
  | 'profile-dir' // the root of this profile's content
  | 'reports-dir'
  | 'output-dir'
  | 'interview-prep-dir'
  // Option-C / Item-4d additions -- previously at repo-root, now per-profile
  // for privacy + multi-user isolation. See docs/DATA_CONTRACT.md.
  | 'jds-dir' // saved JD text files, referenced as `local:<file>` in pipeline.md
  | 'writing-samples-dir' // voice-calibration samples (emails, blog posts, etc.)
  | 'batch-dir' // bulk-CV worker state (batch-input.tsv, batch-state.tsv, logs/, tracker-additions/)
  | 'followup-cache' // derived: per-profile follow-up cadence cache
  | 'patterns-cache' // derived: per-profile rejection-pattern cache
  | 'insights-cache'; // derived: per-profile pipeline insights cache

/**
 * Files that live ABOVE the profile tree -- shared across that user's
 * profiles but isolated per-user. Used for content that transcends
 * profile boundaries (e.g. STAR-story bank shared between an engineer
 * profile and a data-science profile of the same person).
 *
 * Path layout:
 *   multi-user → data/users/{userId}/_shared/{file}
 *   legacy     → data/profiles/_shared/{file}     (userId === SYSTEM_USER_ID)
 */
export type UserSharedFileKind =
  | 'story-bank' // STAR+R interview stories — see modes/interview-prep.md
  | 'autopilot' // recurring-job scheduler config — per-user
  | 'onboarding-state' // wizard step state — per-user
  | 'ui-prefs' // UI preferences (theme, layout, etc.) — per-user
  | 'sources' // scanner connection state (LinkedIn / Indeed sessions) — per-user
  | 'apply-counter' // daily LinkedIn / portal apply counter — per-user so user A's
  // 30 daily applies don't eat into user B's `maxAppliesPerDay` cap
  | 'job-last-run' // per-job last-run state for registered jobs — per-user so
  // autopilot's "did this run today?" dedupe is scoped per user (otherwise
  // user A's 9am scan would block user B's 9am scan from firing)
  | 'backups-dir' // tarball backup destination — per-user (each user's
  // daily snapshot of their own tree)
  | 'secrets'; // per-user encrypted credential store (Anthropic / Gemini /
// Adzuna / Gmail-IMAP / OpenAI API keys + tokens). AES-256-GCM at rest,
// key derived via HKDF(BETTER_AUTH_SECRET + per-user salt). See
// user-secrets.ts for the threat model + format spec.

const PROFILES_ROOT = path.join(ROOT, 'data', 'profiles');
const USERS_ROOT = path.join(ROOT, 'data', 'users');

/**
 * Where the per-profile content tree lives for the given user.
 *
 *   • System / pre-multi-user mode (userId === SYSTEM_USER_ID): legacy
 *     layout at `data/profiles/{slug}/...`. This stays the source of truth
 *     for single-user installs and for code paths that haven't been
 *     audited for user-context yet.
 *
 *   • Real users: `data/users/{userId}/profiles/{slug}/...`. The
 *     per-user prefix guarantees two users with the same profile slug
 *     ("default", "engineer-search") never collide on disk.
 *
 * Migration story: on first read for a user under the new layout, the
 * caller (or the migration helper in `profile-migrate.ts`) copies the
 * relevant data/profiles/{slug}/ tree under `data/users/{userId}/...`.
 * The legacy tree is left in place so single-user-mode tooling still
 * works during the transition.
 */
function userProfilesRoot(userId: string): string {
  if (userId === SYSTEM_USER_ID) return PROFILES_ROOT;
  return path.join(USERS_ROOT, userId, 'profiles');
}

function validateProfileId(profileId: unknown): asserts profileId is string {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error('profilePath: profileId is required (got ' + JSON.stringify(profileId) + ')');
  }
  if (
    (profileId as string).includes('/') ||
    (profileId as string).includes('\\') ||
    (profileId as string).includes('..')
  ) {
    throw new Error('profilePath: invalid profileId (path-traversal attempt): ' + profileId);
  }
}

function validateUserId(userId: unknown): asserts userId is string {
  if (!userId || typeof userId !== 'string') {
    throw new Error('profilePath: userId is required (got ' + JSON.stringify(userId) + ')');
  }
  if (
    (userId as string).includes('/') ||
    (userId as string).includes('\\') ||
    (userId as string).includes('..')
  ) {
    throw new Error('profilePath: invalid userId (path-traversal attempt): ' + userId);
  }
}

/**
 * Resolve the on-disk path of a per-profile file or directory.
 *
 * Caller MUST pass a real profileId -- this function does NOT default to
 * the active profile. Defaulting happens at the helper-function level
 * (readProfile, readPortals, etc.) so a missing-profileId bug surfaces
 * loudly here rather than silently writing to the active profile's files.
 *
 * User scope is implicit (via `user-context.ts`'s AsyncLocalStorage). For
 * explicit per-user calls (e.g. background jobs that iterate every user),
 * use `profilePathForUser(userId, profileId, kind)`.
 */
export function profilePath(profileId: string, kind: ProfileFileKind): string {
  const userId = currentUserIdOrDefault();
  return profilePathForUser(userId, profileId, kind);
}

/** Like `profilePath` but takes an explicit userId. Use this from background
 *  jobs or cross-user maintenance code where AsyncLocalStorage isn't set. */
export function profilePathForUser(
  userId: string,
  profileId: string,
  kind: ProfileFileKind,
): string {
  validateUserId(userId);
  validateProfileId(profileId);
  const base = path.join(userProfilesRoot(userId), profileId);
  switch (kind) {
    case 'profile-dir':
      return base;
    case 'cv-md':
      return path.join(base, 'cv.md');
    case 'profile-yml':
      return path.join(base, 'profile.yml');
    case 'profile-md':
      return path.join(base, '_profile.md');
    case 'portals-yml':
      return path.join(base, 'portals.yml');
    case 'article-digest':
      return path.join(base, 'article-digest.md');
    case 'pipeline':
      return path.join(base, 'pipeline.md');
    case 'applications':
      return path.join(base, 'applications.md');
    case 'scan-history':
      return path.join(base, 'scan-history.tsv');
    case 'gemini-scores':
      return path.join(base, 'gemini-scores.tsv');
    case 'follow-ups':
      return path.join(base, 'follow-ups.md');
    case 'projects-json':
      return path.join(base, 'projects.json');
    case 'stage-state-json':
      return path.join(base, 'stage-state.json');
    case 'interviewers-json':
      return path.join(base, 'interviewers.json');
    case 'offers-json':
      return path.join(base, 'offers.json');
    case 'linkedin-audit-json':
      return path.join(base, 'linkedin-audit.json');
    case 'inbound-leads-jsonl':
      return path.join(base, 'inbound-leads.jsonl');
    case 'inbound-threads-json':
      return path.join(base, 'inbound-threads.json');
    case 'reports-dir':
      return path.join(base, 'reports');
    case 'output-dir':
      return path.join(base, 'output');
    case 'interview-prep-dir':
      return path.join(base, 'interview-prep');
    case 'jds-dir':
      return path.join(base, 'jds');
    case 'writing-samples-dir':
      return path.join(base, 'writing-samples');
    case 'batch-dir':
      return path.join(base, 'batch');
    case 'followup-cache':
      return path.join(base, 'followup-cache.json');
    case 'patterns-cache':
      return path.join(base, 'patterns-cache.json');
    case 'insights-cache':
      return path.join(base, 'insights-cache.json');
  }
}

/** Resolve the on-disk path of a user-shared (across-profiles) file
 *  for the CURRENT user. Use this for content like story-bank.md that
 *  spans the user's own profiles but stays private to them.
 *
 *  Path layout:
 *    multi-user → data/users/{userId}/_shared/{file}
 *    legacy     → data/profiles/_shared/{file}     (SYSTEM_USER_ID) */
export function userSharedPath(kind: UserSharedFileKind): string {
  return userSharedPathForUser(currentUserIdOrDefault(), kind);
}

/** Like `userSharedPath` but takes an explicit userId.
 *
 *  Path: data/users/{userId}/profiles/_shared/{file}  (multi-user)
 *    or: data/profiles/_shared/{file}                 (legacy single-user)
 *
 *  The "_shared" dir lives INSIDE the profiles/ tree (sibling to each
 *  real profile dir) so the layout reads as: "every dir under profiles/
 *  is either a real profile or the _shared escape-hatch". */
export function userSharedPathForUser(userId: string, kind: UserSharedFileKind): string {
  validateUserId(userId);
  const base =
    userId === SYSTEM_USER_ID
      ? path.join(PROFILES_ROOT, '_shared')
      : path.join(USERS_ROOT, userId, 'profiles', '_shared');
  switch (kind) {
    case 'story-bank':
      return path.join(base, 'story-bank.md');
    case 'autopilot':
      return path.join(base, 'autopilot.json');
    case 'onboarding-state':
      return path.join(base, 'onboarding-state.json');
    case 'ui-prefs':
      return path.join(base, 'ui-prefs.json');
    case 'sources':
      return path.join(base, 'sources.json');
    case 'apply-counter':
      return path.join(base, 'apply-counter.json');
    case 'job-last-run':
      return path.join(base, 'job-last-run.json');
    case 'backups-dir':
      return path.join(base, 'backups');
    case 'secrets':
      return path.join(base, 'secrets.json');
  }
}

/**
 * Resolve the persistent Chromium dir for a per-portal Playwright session.
 *
 * F20 -- TS mirror of `scripts/lib/lib_playwright_auth.py::user_data_dir`.
 * Pre-fix the disconnect/test endpoints used `path.join(ROOT,
 * '.playwright-' + portal)` which never matched the actual layout
 * (Python writes to `data/users/{uid}/.playwright-{portal}/`). Result:
 * "Disconnect LinkedIn" was a no-op.
 *
 * Layout:
 *   multi-user → data/users/{userId}/.playwright-{portal}/
 *   legacy     → data/profiles/_shared/.playwright-{portal}/ (SYSTEM_USER)
 *
 * Caller is responsible for verifying `portal` against an allowlist --
 * we accept any string here so the same helper works for new portals
 * added without code changes.
 */
export function playwrightUserDataDir(userId: string, portal: string): string {
  validateUserId(userId);
  // Allow letters / digits / hyphen / underscore in portal slug; reject
  // path-traversal attempts.
  if (!/^[a-zA-Z0-9_-]+$/.test(portal)) {
    throw new Error('playwrightUserDataDir: invalid portal: ' + portal);
  }
  if (userId === SYSTEM_USER_ID) {
    return path.join(PROFILES_ROOT, '_shared', '.playwright-' + portal);
  }
  return path.join(USERS_ROOT, userId, '.playwright-' + portal);
}

/** Make sure the profile directory + its standard subdirs exist for the
 *  CURRENT user. Idempotent. */
export function ensureProfileDirs(profileId: string): void {
  const userId = currentUserIdOrDefault();
  ensureProfileDirsForUser(userId, profileId);
}

/** Like `ensureProfileDirs` but takes an explicit userId. */
export function ensureProfileDirsForUser(userId: string, profileId: string): void {
  fs.mkdirSync(profilePathForUser(userId, profileId, 'profile-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'reports-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'output-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'interview-prep-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'jds-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'writing-samples-dir'), { recursive: true });
  fs.mkdirSync(profilePathForUser(userId, profileId, 'batch-dir'), { recursive: true });
  // The user-shared dir lives one level above profiles -- create it on the
  // first profile-creation event so userSharedPath() reads always resolve.
  fs.mkdirSync(path.dirname(userSharedPathForUser(userId, 'story-bank')), { recursive: true });
}

// D20 -- `profileDirExists` removed: no caller. Use `fs.existsSync(profilePath(id, 'profile-dir'))`
// directly if needed; reinstate as a helper once two+ call sites materialise.

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
