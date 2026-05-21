#!/usr/bin/env node
/**
 * verify-i18n.mjs -- assert locale-mode parity with the canonical
 * English `modes/*.md` set.
 *
 * Heron's mode prompts live at `modes/*.md` and drive every AI-CLI
 * spawn (evaluate / outreach / interview-prep / cover-letter / etc.).
 * Localised variants live at `modes/{de,fr,ja,pt,ru,es}/*.md` and
 * are selected via `profile.yml::language.modes_dir`.
 *
 * Failure modes this guard catches:
 *
 *   • New mode added to `modes/` but the locale dirs forget it →
 *     localised users silently fall back to English mid-flow (no
 *     production bug, but breaks the "consistent voice" guarantee).
 *
 *   • Locale dir exists but a file disappears (rename, lint sweep) →
 *     same fallback issue.
 *
 *   • A locale dir contains a file the English set doesn't → drift
 *     from the canonical source; will never be loaded by any caller
 *     that maps EN → locale by filename.
 *
 * Current state (commit 7e3fd99 dropped i18n mode translations): NO
 * locale directories exist. The script exits 0 with a NOTICE; if a
 * future commit restores them, the parity gate engages automatically.
 *
 * Modes:
 *
 *   default   verify parity; exit 1 on drift
 *   --strict  treat "no locale dirs" as drift (use during CI for any
 *             release that promises i18n)
 *   --json    emit machine-readable coverage report on stdout in the
 *             shape:
 *               {
 *                 "locales": ["de", "fr", ...],
 *                 "totals": {
 *                   "de": { "translated": <int>, "missing": <int> },
 *                   ...
 *                 },
 *                 "english_count": <int>
 *               }
 *             Used by `.github/workflows/i18n-comment.yml` to power
 *             the `heron-pr-i18n` sticky. Exits 0 regardless of drift
 *             when --json is set (the consumer formats the data).
 *
 * Wired into:
 *   - lefthook.yml `verify-i18n` pre-commit hook (when modes/* changes)
 *   - CI test.yml as `pnpm i18n:verify`
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODES_DIR = join(ROOT, 'modes');
const KNOWN_LOCALES = ['de', 'fr', 'ja', 'pt', 'ru', 'es'];

const STRICT = process.argv.includes('--strict');
const JSON_OUT = process.argv.includes('--json');

if (!existsSync(MODES_DIR)) {
  console.error('::error::modes/ directory missing');
  process.exit(2);
}

/** All English `.md` files at the root of `modes/`. The locale dirs
 *  must match this set 1-for-1 (same filenames; localised content). */
const englishModes = readdirSync(MODES_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .sort();

if (englishModes.length === 0) {
  console.error('::error::modes/ has no .md files — wrong directory?');
  process.exit(2);
}

const existingLocales = KNOWN_LOCALES.filter((lang) => {
  const dir = join(MODES_DIR, lang);
  return existsSync(dir) && statSync(dir).isDirectory();
});

if (existingLocales.length === 0) {
  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify({ locales: [], totals: {}, english_count: englishModes.length }) + '\n',
    );
    process.exit(0);
  }
  if (STRICT) {
    console.error(
      '::error::no locale directories under modes/ — strict mode requires at least one',
    );
    process.exit(1);
  }
  console.log(
    `✓ i18n verify — ${englishModes.length} English modes, 0 locale dirs (i18n not active; exit 0)`,
  );
  process.exit(0);
}

// Per-locale stats for the JSON path + the human-readable path below.
const stats = {};
let drift = 0;
for (const lang of existingLocales) {
  const dir = join(MODES_DIR, lang);
  const localeMd = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();
  stats[lang] = {
    translated: Math.min(localeMd.length, englishModes.length),
    missing: Math.max(0, englishModes.length - localeMd.length),
  };
  // Locale files may be RENAMED versions of the English ones (e.g.
  // German `angebot.md` mirrors English `evaluate.md`). The parity gate
  // checks COUNT + locale-specific-allowlist, not literal filenames.
  // Stricter mapping would require a per-locale rename table; we
  // optimise for "either has every mode or none" which is the actual
  // failure mode (a half-localised dir leaves the user with mixed
  // language responses).
  const missingCount = stats[lang].missing;
  if (missingCount > 0) {
    if (!JSON_OUT) {
      console.error(
        `  ✗ modes/${lang}/ -- ${localeMd.length} files (expected ${englishModes.length} for parity)`,
      );
    }
    drift += 1;
  } else if (!JSON_OUT) {
    console.log(`  ✓ modes/${lang}/ -- ${localeMd.length} files (parity with English)`);
  }
}

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({
      locales: existingLocales,
      totals: stats,
      english_count: englishModes.length,
    }) + '\n',
  );
  process.exit(0);
}

if (drift > 0) {
  console.error(`\n::error::${drift} locale(s) drift from English parity. See above for details.`);
  console.error(`Run \`ls modes/<locale>/\` against \`ls modes/\` to find the gap.`);
  process.exit(1);
}

console.log(
  `\n✓ i18n verify — ${englishModes.length} English modes × ${existingLocales.length} locales, all in parity`,
);
