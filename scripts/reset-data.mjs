#!/usr/bin/env node
/**
 * reset-data — full user-data nuke for re-testing first-time UX.
 *
 * Per the user's specification:
 *   • Option A (full nuke): wipe cv.md / profile.yml / _profile.md so the
 *     onboarding flow fires from zero.
 *   • EXCEPTION: preserve portals.yml — job source configuration is
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const PROFILES = join(DATA, 'profiles');

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

/** Files PRESERVED at the profile level — explicit allowlist. */
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
];

/** Top-level data/ subdirs wiped on full reset. */
const SHARED_DATA_DIRS = ['apply-state', 'avatars'];

// Symlinks at repo root that point into the active profile.
// These need to be removed since the targets are gone; boot routine
// recreates them after onboarding finishes.
const ROOT_SYMLINKS = [
  'cv.md',
  'config/profile.yml',
  'portals.yml',
  'modes/_profile.md',
  'article-digest.md',
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

/** existsSync follows symlinks — a dangling symlink reads as "missing".
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

function listToDelete() {
  const items = [];

  // Per-profile
  if (existsSync(PROFILES)) {
    const profiles = readdirSync(PROFILES).filter((f) => {
      try {
        return statSync(join(PROFILES, f)).isDirectory();
      } catch {
        return false;
      }
    });
    for (const p of profiles) {
      const pDir = join(PROFILES, p);
      for (const f of PER_PROFILE_DELETE) {
        const full = join(pDir, f);
        const kind = probe(full);
        if (kind) items.push({ kind, path: full, label: `profile:${p}/${f}` });
      }
      for (const d of PER_PROFILE_DELETE_DIRS) {
        const full = join(pDir, d);
        const kind = probe(full);
        if (kind) items.push({ kind, path: full, label: `profile:${p}/${d}/` });
      }
    }
  }

  // Shared
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

  // Root symlinks (use lstat so dangling symlinks still get cleaned up)
  for (const link of ROOT_SYMLINKS) {
    const full = join(ROOT, link);
    const kind = probe(full);
    if (kind) items.push({ kind: 'symlink', path: full, label: link });
  }

  return items;
}

async function main() {
  console.log(color(BOLD, '\ncareer-ops reset-data\n'));
  console.log(color(DIM, 'Wipes ALL user data (CV, profile, applications, reports, etc.) so'));
  console.log(color(DIM, 'the next launch fires onboarding from scratch.'));
  console.log(color(DIM, `PRESERVED: ${PER_PROFILE_KEEP.join(', ')} (job sources).`));
  console.log(color(DIM, `BACKUP:    everything copied to data/.reset-bak-<timestamp>/ first.\n`));

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
