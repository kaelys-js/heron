#!/usr/bin/env node
/**
 * reset-data -- full user-data nuke for re-testing first-time UX.
 *
 * Per the user's specification:
 *   • Option A (full nuke): wipe cv.md / profile.yml / _profile.md so the
 *     onboarding flow fires from zero.
 *   • EXCEPTION: preserve portals.yml -- job source configuration is
 *     useful infrastructure regardless of who's using the system.
 *   • Backup everything deleted to data/.reset-bak-{timestamp}/ so it's
 *     recoverable if you change your mind. The backup dir is gitignored.
 *
 * Always prompts for explicit y/N confirmation before deleting anything.
 * `--dry-run` shows what WOULD be deleted without touching the filesystem.
 * `--yes` skips the prompt (use only when scripted in tests).
 *
 * Run:
 *   pnpm reset:data                # interactive
 *   pnpm reset:data --dry-run      # show plan
 *   pnpm reset:data --yes          # skip confirmation
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  cpSync,
  rmSync,
  mkdirSync,
  statSync,
  lstatSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execSync } from 'node:child_process';

// scripts/system/ -> scripts/ -> repo root (../.. from this script).
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA = join(ROOT, 'data');
const PROFILES = join(DATA, 'profiles');
const USERS_ROOT = join(DATA, 'users');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const dryRun = process.argv.includes('--dry-run');
const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

/**
 * Files inside each `data/profiles/{slug}/` that we wipe.
 * Option A (full nuke) wipes everything EXCEPT portals.yml.
 */
const PER_PROFILE_DELETE = [
  // Identity / configuration (Option A = wipe so onboarding fires)
  'cv.md',
  'profile.yml',
  '_profile.md',
  'article-digest.md',
  // Job data
  'applications.md',
  'pipeline.md',
  'scan-history.tsv',
  'gemini-scores.tsv',
  'follow-ups.md',
  'projects.json',
  'form-answers-cache.jsonl',
];

const PER_PROFILE_DELETE_DIRS = ['reports', 'output', 'interview-prep'];

/** Files PRESERVED at the profile level -- explicit allowlist. */
const PER_PROFILE_KEEP = [
  'portals.yml', // job sources — user said keep
];

/** Top-level data/ files (shared across profiles) wiped on full reset. */
const SHARED_DATA_FILES = [
  'activity.jsonl',
  'issues.jsonl',
  'sources.json',
  'onboarding-state.json',
  'job-last-run.json',
  'apply-counter.json',
  'autopilot.json',
  'ui-prefs.json',
  'profiles.json', // forces fresh boot migration
  // SQLite databases -- wiping these is the ONLY way to reset the
  // first-user owner-onboarding flow. auth.db holds users / sessions /
  // passkeys / invite codes; app.db holds every per-user job /
  // application / interview row. Both are auto-recreated empty by
  // `new Database(path)` in src/lib/server/db/index.ts on the next
  // request. Sidecar journal files (-shm, -wal) are also nuked below
  // via the per-file glob loop so SQLite doesn't replay a stale WAL
  // on the next boot.
  'auth.db',
  'auth.db-shm',
  'auth.db-wal',
  'app.db',
  'app.db-shm',
  'app.db-wal',
];

/** Top-level data/ subdirs wiped on full reset. */
const SHARED_DATA_DIRS = ['apply-state', 'avatars'];

// Stray repo-root files/dirs that PRE-Option-C versions of the
// dashboard created as compatibility symlinks. Option C removed the
// symlink-maintenance machinery; these paths shouldn't exist on a
// clean install but we sweep them on reset to handle the migration
// case (user upgrades to post-Option-C from a pre-Option-C install
// that left the symlinks behind).
const STRAY_REPO_ROOT_PATHS = [
  'cv.md',
  'config/profile.yml',
  'portals.yml',
  'modes/_profile.md',
  'article-digest.md',
  'jds',
  'writing-samples',
  'interview-prep',
  'reports',
  'output',
];

function color(c, s) {
  return c + s + RESET;
}

async function confirm(prompt) {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const ans = await rl.question(prompt);
    return /^(y|yes)$/i.test(ans.trim());
  } finally {
    rl.close();
  }
}

/** existsSync follows symlinks -- a dangling symlink reads as "missing".
 *  We DO want to clean up dangling symlinks though, so use lstat which
 *  inspects the symlink itself. Returns one of:
 *    'file' / 'dir' / 'symlink' / null (truly absent). */
function probe(path) {
  try {
    const ls = lstatSync(path);
    if (ls.isSymbolicLink()) return 'symlink';
    if (ls.isDirectory()) return 'dir';
    return 'file';
  } catch {
    return null;
  }
}

/** Enumerate the subdir slugs under a parent dir. Skips non-directory
 *  entries (stray files dropped into the parent by accident). */
function listSubdirs(parent) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((f) => {
    try {
      return statSync(join(parent, f)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Queue every file/dir we should wipe inside a profile dir for the
 *  Option A (full nuke) reset. Label-prefix lets the dry-run output
 *  distinguish legacy single-user profiles from per-user profiles. */
function queueProfile(items, pDir, labelPrefix) {
  for (const f of PER_PROFILE_DELETE) {
    const full = join(pDir, f);
    const kind = probe(full);
    if (kind) items.push({ kind, path: full, label: `${labelPrefix}/${f}` });
  }
  for (const d of PER_PROFILE_DELETE_DIRS) {
    const full = join(pDir, d);
    const kind = probe(full);
    if (kind) items.push({ kind, path: full, label: `${labelPrefix}/${d}/` });
  }
}

function listToDelete() {
  const items = [];

  // Legacy single-user profiles: data/profiles/{slug}/
  // Pre-multi-user installs lived here; first-user-claims-default
  // migration copies them under data/users/{uid}/profiles/ on first
  // boot. We still wipe the legacy tree so a stale copy from before
  // the migration doesn't survive a reset.
  for (const p of listSubdirs(PROFILES)) {
    // Skip the _shared escape-hatch dir -- that's per-user content
    // (story-bank, etc.) and gets wiped via SHARED_DATA_FILES below
    // OR explicitly by the per-user pass when applicable.
    if (p === '_shared') continue;
    queueProfile(items, join(PROFILES, p), `profile:${p}`);
  }

  // Multi-user profiles: data/users/{uid}/profiles/{slug}/
  // Walk every user's profiles tree so a reset truly nukes ALL users'
  // data, not just the legacy single-user fallback. Pre-fix this loop
  // was missing and reset-data left every real user's content intact
  // when a legacy data/profiles/ tree also existed.
  for (const uid of listSubdirs(USERS_ROOT)) {
    const userProfiles = join(USERS_ROOT, uid, 'profiles');
    for (const p of listSubdirs(userProfiles)) {
      if (p === '_shared') continue; // see above
      queueProfile(items, join(userProfiles, p), `user:${uid}/profile:${p}`);
    }
    // Per-user _shared dir (story-bank.md, autopilot.json, etc.) -- wipe wholesale.
    const sharedDir = join(userProfiles, '_shared');
    const sharedKind = probe(sharedDir);
    if (sharedKind)
      items.push({ kind: sharedKind, path: sharedDir, label: `user:${uid}/_shared/` });
    // Per-user Playwright session dirs (.playwright-{portal}/) -- credential
    // material so explicitly wiped on full reset.
    for (const entry of existsSync(join(USERS_ROOT, uid))
      ? readdirSync(join(USERS_ROOT, uid))
      : []) {
      if (!entry.startsWith('.playwright-')) continue;
      const full = join(USERS_ROOT, uid, entry);
      const kind = probe(full);
      if (kind) items.push({ kind, path: full, label: `user:${uid}/${entry}/` });
    }
  }

  // Shared (install-wide) data files + dirs.
  for (const f of SHARED_DATA_FILES) {
    const full = join(DATA, f);
    const kind = probe(full);
    if (kind) items.push({ kind, path: full, label: `data/${f}` });
  }
  for (const d of SHARED_DATA_DIRS) {
    const full = join(DATA, d);
    const kind = probe(full);
    if (kind) items.push({ kind, path: full, label: `data/${d}/` });
  }

  // Stray repo-root paths left over from pre-Option-C installs
  // (compatibility symlinks that no longer get maintained). Use lstat
  // so dangling symlinks still get cleaned up.
  for (const stray of STRAY_REPO_ROOT_PATHS) {
    const full = join(ROOT, stray);
    const kind = probe(full);
    if (kind) items.push({ kind, path: full, label: stray });
  }

  return items;
}

/**
 * Detect a running dev server (pnpm dev, dev:ios --live, etc.) by
 * probing :5173. If found, refuse to proceed -- the server's open
 * SQLite handles would prevent the .db files from cleanly reseting,
 * leaving a zombie state (file deleted but inode still held, new
 * writes to "phantom" file, fresh `new Database()` opens an empty
 * 0-byte file with no schema, /login → /signup loop fails).
 *
 * The user must kill the dev server first, run reset, then restart.
 */
function detectRunningDevServer() {
  try {
    // `lsof -ti :5173` returns matching pids, one per line; empty if none.
    const out = execSync('lsof -ti :5173 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!out) return [];
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    // lsof not available or no listeners -- proceed.
    return [];
  }
}

async function main() {
  console.log(color(BOLD, '\nheron reset-data\n'));
  console.log(color(DIM, 'Wipes ALL user data (CV, profile, applications, reports, etc.) so'));
  console.log(color(DIM, 'the next launch fires onboarding from scratch.'));
  console.log(color(DIM, `PRESERVED: ${PER_PROFILE_KEEP.join(', ')} (job sources).`));
  console.log(color(DIM, `BACKUP:    everything copied to data/.reset-bak-<timestamp>/ first.\n`));

  // Sanity check: refuse if a dev server is holding open the DB files.
  // Otherwise the .db inodes stay alive in the server's process and
  // the reset leaves a zombie (auth.db at 0 bytes, schema missing).
  const liveServers = detectRunningDevServer();
  if (liveServers.length > 0 && !skipConfirm) {
    console.log(color(RED, '✗ Dev server is running (pids: ' + liveServers.join(', ') + ')'));
    console.log(color(DIM, '  Open SQLite connections would zombie the .db reset.'));
    console.log(color(DIM, '  Kill it first:'));
    console.log(color(DIM, '    pkill -f "dev-ios.mjs"; pkill -f "vite dev"'));
    console.log(color(DIM, '  Then re-run pnpm reset-data.'));
    console.log(color(DIM, '  (Override with --yes if you understand the risk.)'));
    process.exit(2);
  }

  const items = listToDelete();
  if (items.length === 0) {
    console.log(color(GREEN, '✓ No user data found — nothing to reset.'));
    return;
  }

  console.log(color(CYAN, '▸ Will delete:\n'));
  for (const item of items) {
    const icon = item.kind === 'dir' ? '📂' : item.kind === 'symlink' ? '🔗' : '📄';
    console.log(`  ${icon} ${item.label}`);
  }
  console.log('');

  if (dryRun) {
    console.log(color(YELLOW, `(dry-run — no changes. Remove --dry-run to execute.)`));
    return;
  }

  const proceed = await confirm(
    color(RED, `Type "yes" to delete ${items.length} items and reset to first-launch state: `),
  );
  if (!proceed) {
    console.log(color(YELLOW, 'Aborted — nothing deleted.'));
    return;
  }

  // 1. Snapshot
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bakDir = join(DATA, `.reset-bak-${timestamp}`);
  console.log(color(CYAN, `\n▸ Backing up to ${bakDir.replace(ROOT, '.')}`));
  mkdirSync(bakDir, { recursive: true });
  for (const item of items) {
    if (item.kind === 'symlink') continue; // symlinks aren't data
    try {
      const rel = item.path.replace(ROOT + '/', '');
      const dst = join(bakDir, rel);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(item.path, dst, { recursive: true, dereference: false });
    } catch (e) {
      console.log(color(YELLOW, `  ! backup skipped: ${item.label} — ${e.message}`));
    }
  }
  console.log(color(GREEN, `  ✓ backup complete`));

  // 2. Delete
  console.log(color(CYAN, '\n▸ Deleting'));
  let deleted = 0;
  for (const item of items) {
    try {
      if (item.kind === 'symlink') {
        rmSync(item.path, { force: true });
      } else if (item.kind === 'dir') {
        rmSync(item.path, { recursive: true, force: true });
      } else {
        rmSync(item.path, { force: true });
      }
      deleted++;
    } catch (e) {
      console.log(color(YELLOW, `  ! delete failed: ${item.label} — ${e.message}`));
    }
  }
  console.log(color(GREEN, `  ✓ ${deleted}/${items.length} items deleted`));

  // 3. Re-stub the profiles dir so the boot routine fires onboarding cleanly
  console.log(color(CYAN, '\n▸ Re-stubbing for fresh onboarding'));
  mkdirSync(DATA, { recursive: true });
  console.log(color(DIM, `  data/ preserved (empty)`));

  // 4. Done
  console.log(color(GREEN, BOLD + `\n✓ Reset complete.` + RESET));
  console.log(color(DIM, `  Backup:    ${bakDir.replace(ROOT, '.')}`));
  console.log(color(DIM, `  Restore:   cp -r ${bakDir.replace(ROOT, '.')}/data/* data/`));
  console.log(color(DIM, `\nNext step:`));
  console.log('  pnpm dev     # boot — should land on onboarding\n');
}

main().catch((e) => {
  console.error(color(RED, '\n✗ reset-data failed: ' + e.message));
  process.exit(1);
});
