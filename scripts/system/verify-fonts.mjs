#!/usr/bin/env node
/**
 * verify-fonts.mjs -- guard the self-hosted woff2 files against silent
 * tampering / accidental upgrade.
 *
 * Closes TYPOGRAPHY.md Task 9 item 5: "Pre-commit verifier: ensure
 * self-hosted woff2 SHA256 matches the upstream Google Fonts release."
 *
 * What it does:
 *
 *   1. Walks `ui/static/fonts/*.woff2`
 *   2. Computes SHA256 of each file
 *   3. Compares against `ui/static/fonts/CHECKSUMS.json`
 *   4. Reports drift with a clear actionable message
 *
 * Modes:
 *
 *   - default: read-only verify; exit 1 on drift
 *   - --update: regenerate CHECKSUMS.json from current file contents.
 *     Use after a deliberate font upgrade.
 *
 * Wired into lefthook pre-commit as `verify-fonts` (only fires when a
 * woff2 or CHECKSUMS.json is staged). Wired into the test workflow as
 * `pnpm fonts:verify` so CI catches a manual file replacement.
 *
 * Why ship a lockfile + verifier instead of just trusting git?
 *
 *   • A repo-rename / fork / illustrator-handover swap could
 *     accidentally include a "lookalike" woff2 (e.g. Inter from a
 *     different Google Fonts release). The drift would compile but
 *     subtly shift letterforms.
 *   • A supply-chain attacker hijacking a contributor's PR could
 *     swap a font for one with a malicious cmap table. Rare but the
 *     guard is cheap.
 *   • The lockfile gives a clear "this is what we ship" pin for OSS
 *     reproducibility -- fork users can run the same verify.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { error } from '../lib/logger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS_DIR = join(ROOT, 'ui', 'static', 'fonts');
const CHECKSUMS = join(FONTS_DIR, 'CHECKSUMS.json');

const MODE_UPDATE = process.argv.includes('--update');

/** Compute SHA256 of a file's bytes. */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Walk fonts dir + compute current SHA256 for every woff2. */
function currentChecksums() {
  if (!existsSync(FONTS_DIR) || !statSync(FONTS_DIR).isDirectory()) {
    error(`fonts dir missing: ${FONTS_DIR}`);
    process.exit(2);
  }
  const out = {};
  for (const name of readdirSync(FONTS_DIR).sort()) {
    if (!name.endsWith('.woff2')) continue;
    out[name] = sha256(join(FONTS_DIR, name));
  }
  return out;
}

function loadLocked() {
  if (!existsSync(CHECKSUMS)) return {};
  try {
    const raw = readFileSync(CHECKSUMS, 'utf8');
    const parsed = JSON.parse(raw);
    // Strip the $comment field which exists for human readers.
    const { $comment, ...rest } = parsed;
    return rest;
  } catch (e) {
    error(`CHECKSUMS.json malformed: ${e.message}`);
    process.exit(2);
  }
}

function writeLocked(checksums) {
  const ordered = Object.fromEntries(
    Object.entries(checksums).sort(([a], [b]) => a.localeCompare(b)),
  );
  const body =
    JSON.stringify(
      {
        $comment:
          'SHA256 checksums of the self-hosted woff2 files. Verified by scripts/system/verify-fonts.mjs on every commit that touches a .woff2 (see lefthook.yml). Drift = either a deliberate font swap (regenerate with `pnpm fonts:lock`) OR a tampered file. Keep this file in source control so a fresh clone gets the same guarantees.',
        ...ordered,
      },
      null,
      2,
    ) + '\n';
  writeFileSync(CHECKSUMS, body);
}

const current = currentChecksums();
const locked = loadLocked();

if (MODE_UPDATE) {
  writeLocked(current);
  console.log(`✓ Updated ${basename(CHECKSUMS)} with ${Object.keys(current).length} entries`);
  process.exit(0);
}

// Verify mode: compare current → locked. Report adds / removes / drift.
const adds = Object.keys(current).filter((k) => !(k in locked));
const removes = Object.keys(locked).filter((k) => !(k in current));
const drifts = Object.keys(current).filter((k) => k in locked && current[k] !== locked[k]);

if (adds.length === 0 && removes.length === 0 && drifts.length === 0) {
  console.log(`✓ All ${Object.keys(current).length} woff2 files match CHECKSUMS.json`);
  process.exit(0);
}

console.error('\n✗ Font drift detected:\n');
for (const name of drifts) {
  console.error(`  ~ ${name}`);
  console.error(`      locked: ${locked[name].slice(0, 12)}…`);
  console.error(`      actual: ${current[name].slice(0, 12)}…`);
}
for (const name of adds) {
  console.error(`  + ${name} (not in CHECKSUMS.json)`);
}
for (const name of removes) {
  console.error(`  - ${name} (in CHECKSUMS.json but missing on disk)`);
}
console.error('\nIf this drift is intentional (deliberate font upgrade):');
console.error('  pnpm fonts:lock      # regenerate CHECKSUMS.json from current files');
console.error('\nIf NOT intentional: a woff2 file was tampered with or accidentally replaced.');
console.error('Restore the original file before committing.');
process.exit(1);
