/**
 * profile-migrate -- one-time migration from the legacy single-profile
 * flat layout to the new multi-profile `data/profiles/{slug}/` layout.
 *
 * Idempotent: re-running after migration succeeded is a no-op. Safe to
 * call unconditionally on every server boot.
 *
 * Safety design:
 *  - Every moved file gets a `.bak` sibling at its ORIGINAL path before
 *    being moved. If anything goes wrong, the user can restore by hand.
 *  - We use copyFile + unlink rather than rename, so a partial failure
 *    leaves the original intact.
 *  - Migration writes `data/profiles.json` LAST. If the process crashes
 *    mid-way, the next boot retries the migration (since profiles.json
 *    doesn't exist yet).
 *
 * Source → destination mapping for the `default` profile:
 *
 *   cv.md                          → data/profiles/default/cv.md
 *   config/profile.yml             → data/profiles/default/profile.yml
 *   portals.yml                    → data/profiles/default/portals.yml
 *   modes/_profile.md              → data/profiles/default/_profile.md
 *   article-digest.md              → data/profiles/default/article-digest.md
 *   data/pipeline.md               → data/profiles/default/pipeline.md
 *   data/applications.md           → data/profiles/default/applications.md
 *   data/scan-history.tsv          → data/profiles/default/scan-history.tsv
 *   data/gemini-scores.tsv         → data/profiles/default/gemini-scores.tsv
 *   data/follow-ups.md             → data/profiles/default/follow-ups.md
 *   data/projects.json             → data/profiles/default/projects.json
 *   reports/*                      → data/profiles/default/reports/*
 *   output/*                       → data/profiles/default/output/*
 *   interview-prep/{company}-*.md  → data/profiles/default/interview-prep/*
 *
 * What we DO NOT touch (intentionally -- these are shared):
 *   .env, .playwright-*, data/sources.json, data/onboarding-state.json,
 *   data/autopilot.json, data/activity.jsonl, data/issues.jsonl,
 *   data/inbox-mbox/, *-cache.json, interview-prep/story-bank.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { ensureProfileDirs, profilePath } from './profile-paths';
import { writeProfiles, type ProfilesState } from './profiles';
import { logEvent } from './events';

const PROFILES_JSON = path.join(ROOT, 'data', 'profiles.json');
const DEFAULT_PROFILE_ID = 'default';

type MoveSpec =
  | { kind: 'file'; src: string; dst: string }
  | { kind: 'dir-contents'; src: string; dst: string; excludeBasename?: Set<string> };

/** Build the list of source→destination moves for the legacy → default profile. */
function buildMoveSpecs(): MoveSpec[] {
  const dst = (k: Parameters<typeof profilePath>[1]) => profilePath(DEFAULT_PROFILE_ID, k);
  return [
    // Top-level user content
    { kind: 'file', src: path.join(ROOT, 'cv.md'), dst: dst('cv-md') },
    { kind: 'file', src: path.join(ROOT, 'config', 'profile.yml'), dst: dst('profile-yml') },
    { kind: 'file', src: path.join(ROOT, 'portals.yml'), dst: dst('portals-yml') },
    { kind: 'file', src: path.join(ROOT, 'modes', '_profile.md'), dst: dst('profile-md') },
    { kind: 'file', src: path.join(ROOT, 'article-digest.md'), dst: dst('article-digest') },
    // Per-profile data
    { kind: 'file', src: path.join(ROOT, 'data', 'pipeline.md'), dst: dst('pipeline') },
    { kind: 'file', src: path.join(ROOT, 'data', 'applications.md'), dst: dst('applications') },
    { kind: 'file', src: path.join(ROOT, 'data', 'scan-history.tsv'), dst: dst('scan-history') },
    { kind: 'file', src: path.join(ROOT, 'data', 'gemini-scores.tsv'), dst: dst('gemini-scores') },
    { kind: 'file', src: path.join(ROOT, 'data', 'follow-ups.md'), dst: dst('follow-ups') },
    { kind: 'file', src: path.join(ROOT, 'data', 'projects.json'), dst: dst('projects-json') },
    // Per-profile directories -- move CONTENTS not the directory itself
    // (so .gitkeep / system-managed entries stay where they are).
    { kind: 'dir-contents', src: path.join(ROOT, 'reports'), dst: dst('reports-dir') },
    { kind: 'dir-contents', src: path.join(ROOT, 'output'), dst: dst('output-dir') },
    // interview-prep needs the story-bank.md exception -- it's shared,
    // not per-profile, so we leave it where it is.
    {
      kind: 'dir-contents',
      src: path.join(ROOT, 'interview-prep'),
      dst: dst('interview-prep-dir'),
      excludeBasename: new Set(['story-bank.md']),
    },
  ];
}

type MoveResult = {
  moved: string[];
  backedUp: string[];
  skipped: string[];
  errors: { path: string; message: string }[];
};

function backupAndMove(src: string, dst: string, result: MoveResult): void {
  try {
    if (!fs.existsSync(src)) {
      result.skipped.push(path.relative(ROOT, src));
      return;
    }
    // 1. Write .bak at src
    const bak = src + '.bak';
    try {
      fs.copyFileSync(src, bak);
      result.backedUp.push(path.relative(ROOT, bak));
    } catch (e) {
      // .bak failure is non-fatal -- proceed but surface the warning.
      result.errors.push({
        path: path.relative(ROOT, bak),
        message: 'backup failed: ' + (e instanceof Error ? e.message : String(e)),
      });
    }
    // 2. Make sure dst's parent exists
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    // 3. Copy then unlink (NOT rename -- rename can fail across mount points
    //    and is non-atomic in failure modes).
    fs.copyFileSync(src, dst);
    fs.unlinkSync(src);
    result.moved.push(path.relative(ROOT, src) + ' → ' + path.relative(ROOT, dst));
  } catch (e) {
    result.errors.push({
      path: path.relative(ROOT, src),
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function moveDirContents(
  srcDir: string,
  dstDir: string,
  result: MoveResult,
  exclude?: Set<string>,
): void {
  if (!fs.existsSync(srcDir)) {
    result.skipped.push(path.relative(ROOT, srcDir));
    return;
  }
  try {
    const entries = fs.readdirSync(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    for (const name of entries) {
      // Skip already-existing .bak files and .gitkeep markers.
      if (name.endsWith('.bak') || name === '.gitkeep') continue;
      if (exclude?.has(name)) continue;
      const srcPath = path.join(srcDir, name);
      const dstPath = path.join(dstDir, name);
      const stat = fs.statSync(srcPath);
      if (stat.isFile()) {
        backupAndMove(srcPath, dstPath, result);
      } else if (stat.isDirectory()) {
        // Nested dirs (e.g. reports/ may have subdirs in some setups).
        // Recurse -- same exclude rules apply.
        moveDirContents(srcPath, dstPath, result, exclude);
      }
    }
  } catch (e) {
    result.errors.push({
      path: path.relative(ROOT, srcDir),
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Detect whether the legacy single-profile layout is present. We use the
 * presence of `cv.md` OR `config/profile.yml` at the repo root as the
 * canonical signal -- either of those means "this install was created
 * before multi-profile and has real user content sitting in the flat
 * layout".
 *
 * If the profile dir already exists (someone partially migrated), we
 * still return true if any legacy file is still hanging around at the
 * old path -- the migration is idempotent at the per-file level.
 */
function legacyLayoutDetected(): boolean {
  const candidates = [
    path.join(ROOT, 'cv.md'),
    path.join(ROOT, 'config', 'profile.yml'),
    path.join(ROOT, 'portals.yml'),
    path.join(ROOT, 'data', 'pipeline.md'),
    path.join(ROOT, 'data', 'applications.md'),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

/**
 * Run the legacy single-user → multi-profile migration if needed. Safe to
 * call on every boot -- exits early when profiles.json already exists AND
 * no legacy files remain.
 *
 * Multi-user note: this only handles the pre-multi-user → single-default-
 * profile migration. The legacy data ends up under `data/profiles/default/`.
 * Once a real user account is created, `profiles-db.ts:maybeMigrateLegacy()`
 * copies that tree into `data/users/{ownerUserId}/profiles/default/` (the
 * "first user inherits" pattern). This function on its own never creates
 * per-user data -- it only sets up the legacy single-user tree as a staging
 * area for the first signup to inherit.
 */
export function migrateToMultiProfile(): { migrated: boolean; result?: MoveResult } {
  const profilesJsonExists = fs.existsSync(PROFILES_JSON);

  if (profilesJsonExists && !legacyLayoutDetected()) {
    // Already migrated cleanly. Common case -- no work to do.
    return { migrated: false };
  }

  // We're either:
  //  - Fresh install with legacy files (profiles.json doesn't exist yet)
  //  - Partially-migrated install (profiles.json exists but legacy files
  //    leaked back somehow -- unusual but the recursive backup-and-move
  //    handles it idempotently)
  // ensureProfileDirs() with no user context falls back to SYSTEM_USER_ID,
  // which `userProfilesRoot` maps back to the legacy `data/profiles/` root.
  // That's the right place for the migration to land -- `profiles-db.ts`
  // copies from there into a real user's tree on first signup.
  ensureProfileDirs(DEFAULT_PROFILE_ID);

  const result: MoveResult = { moved: [], backedUp: [], skipped: [], errors: [] };

  for (const spec of buildMoveSpecs()) {
    if (spec.kind === 'file') {
      backupAndMove(spec.src, spec.dst, result);
    } else {
      moveDirContents(spec.src, spec.dst, result, spec.excludeBasename);
    }
  }

  // Write profiles.json LAST. If anything before failed catastrophically,
  // we want the next boot to retry the migration -- which requires
  // profiles.json to still be absent (in the no-prior-state case).
  if (!profilesJsonExists) {
    const state: ProfilesState = {
      activeId: DEFAULT_PROFILE_ID,
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'Default',
          color: 'blue',
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        },
      ],
    };
    writeProfiles(state);
  }

  logEvent(
    'profile-migrate',
    result.moved.length > 0
      ? 'Migrated to multi-profile layout'
      : 'Multi-profile layout initialised (nothing to move)',
    {
      level: result.errors.length > 0 ? 'warn' : 'success',
      category: 'system',
      message:
        result.moved.length +
        ' moved · ' +
        result.backedUp.length +
        ' .bak files written · ' +
        result.skipped.length +
        ' missing (skipped) · ' +
        result.errors.length +
        ' errors',
    },
  );

  return { migrated: true, result };
}
