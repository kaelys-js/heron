#!/usr/bin/env node
/**
 * verify-english-only.mjs -- enforce English-only system layer.
 *
 * Heron ships English-only mode templates (locale dirs were dropped in
 * commit 7e3fd99; the `modes_dir` hook in profile.yml still lets a user
 * point at a restored localized directory of their own). This script
 * guards against accidental re-introduction of non-English prose.
 *
 * Two detection layers:
 *
 *   1. Accented-character detection (Spanish: á é í ó ú ñ ¿ ¡) with an
 *      ALLOWLIST of legitimate English loan words (cliché, résumé),
 *      proper nouns (Bogotá, São Paulo), and foreign-language regex
 *      data (offre expirée).
 *
 *   2. Spanish-word-cluster heuristic -- catches prose where the words
 *      happen to lack accent marks but cluster unambiguously Spanish.
 *      A line containing 3+ unambiguous-Spanish-only function words
 *      (aunque / mientras / porque / sino / tampoco / etc.) is flagged.
 *
 * What it scans:
 *   - Every tracked .md under modes/, docs/, branding/, .github/
 *   - Every tracked .ts/.tsx/.svelte/.mjs/.py/.sh under ui/src/, scripts/
 *   - Root-level .md (README.md, AGENTS.md, GEMINI.md, CLAUDE.md)
 *
 * What it skips (gitignored / auto-generated / user-personal):
 *   - STATE.md, TODO*.md, ui/TODO.md
 *   - CHANGELOG.md (release-please managed)
 *   - This script itself (regex literal would trigger self-flag)
 *   - verify-english-only.test.mjs (it deliberately contains Spanish)
 *
 * Usage:
 *   node scripts/system/verify-english-only.mjs
 *
 * Exit codes:
 *   0 = clean
 *   1 = found offenders
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Layer 1: accented characters ────────────────────────────────────

export const ACCENTED_ALLOWLIST = [
  // English loan words / common foreign-origin terms used inside English
  'cliché',
  'clichés',
  'résumé',
  'résumés',
  'fiancé',
  'fiancée',
  'café',
  'naïve',
  'naïveté',
  'déjà vu',
  'façade',
  'voilà',
  // Proper nouns (cities / companies)
  'Bogotá',
  'São Paulo',
  'México',
  'Québec',
  'Zürich',
  'München',
  // Foreign-language data patterns (regex literals etc.)
  'offre expirée',
  "n'est plus disponible",
];

const ACCENTED = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

// ── Layer 2: Spanish word cluster ───────────────────────────────────
// Words that are UNAMBIGUOUSLY Spanish (rarely appear in English code,
// prose, or proper nouns). Three or more on the same line is a strong
// Spanish-language signal. Tuned to minimize false positives -- words
// like "que" / "para" / "con" / "del" are too common in English
// abbreviations / file names to be safe on their own.
export const SPANISH_CLUSTER_WORDS = new Set([
  'aunque',
  'porque',
  'mientras',
  'tampoco',
  'asimismo',
  'siempre',
  'nunca',
  'todavía',
  'ahora',
  'después',
  'antes',
  'aquí',
  'ahí',
  'allí',
  'según',
  'hacia',
  'durante',
  'mediante',
  'incluso',
  'además',
  'sin embargo',
  'es decir',
  'por ejemplo',
  // Verbs (infinitive + common conjugations)
  'hacer',
  'decir',
  'tener',
  'hablar',
  'pueden',
  'puede',
  'debería',
  'tiene',
  'tienen',
  'están',
  'está',
  // Possessives / demonstratives without accent
  'nuestro',
  'nuestra',
  'nuestros',
  'nuestras',
  'vuestro',
  'vuestra',
  'aquel',
  'aquella',
  'aquellos',
  'aquellas',
  // Pronouns
  'nosotros',
  'vosotros',
  'ellos',
  'ellas',
  'alguien',
  'nadie',
]);

const CLUSTER_THRESHOLD = 3;

/** Tokenize a line for cluster matching. Lowercased, stripped of punctuation. */
function clusterTokens(line) {
  return (line.toLowerCase().match(/[a-záéíóúñ']+/g) ?? []).filter(Boolean);
}

/** Return matched cluster words on this line, deduplicated. */
function clusterMatches(line) {
  const tokens = clusterTokens(line);
  const lineLower = line.toLowerCase();
  const matched = new Set();
  for (const tok of tokens) if (SPANISH_CLUSTER_WORDS.has(tok)) matched.add(tok);
  // Multi-word phrases (e.g. "sin embargo")
  for (const phrase of SPANISH_CLUSTER_WORDS) {
    if (phrase.includes(' ') && lineLower.includes(phrase)) matched.add(phrase);
  }
  return [...matched];
}

/**
 * Find offending lines in `text`. Returns an array of
 *   { line, text, reason: 'accented' | 'spanish-cluster', detail }.
 *
 * Exported for unit testing.
 */
export function findOffenders(text) {
  const lines = text.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Layer 1: accented-character check
    if (ACCENTED.test(line)) {
      const tokens = (line.match(/[A-Za-zÀ-ÿ'’]+/g) ?? []).map((t) =>
        t.replace(/^['’"]+|['’",.;:!?)]+$/g, ''),
      );
      const accentedTokens = tokens.filter((t) => ACCENTED.test(t));
      const lineLower = line.toLowerCase();
      let allCovered = true;
      for (const tok of accentedTokens) {
        const tokLower = tok.toLowerCase();
        const okWord = ACCENTED_ALLOWLIST.some((a) => a.toLowerCase() === tokLower);
        const okPhrase = ACCENTED_ALLOWLIST.some(
          (a) => a.includes(' ') && lineLower.includes(a.toLowerCase()),
        );
        if (!okWord && !okPhrase) {
          allCovered = false;
          break;
        }
      }
      if (!allCovered) {
        offenders.push({ line: i + 1, text: line.trim(), reason: 'accented' });
        continue; // already flagged; skip cluster check
      }
    }

    // Layer 2: Spanish word cluster
    const matches = clusterMatches(line);
    if (matches.length >= CLUSTER_THRESHOLD) {
      offenders.push({
        line: i + 1,
        text: line.trim(),
        reason: 'spanish-cluster',
        detail: matches.join(', '),
      });
    }
  }
  return offenders;
}

// ── Scan-set + entrypoint ───────────────────────────────────────────

const SCAN_GLOBS = [
  /^modes\/.*\.md$/,
  /^docs\/.*\.md$/,
  /^scripts\/.*\.(mjs|js|py|sh|rb)$/,
  /^branding\/.*\.md$/,
  /^\.github\/.*\.md$/,
  /^ui\/src\/.*\.(ts|tsx|svelte|mjs)$/,
  /^[A-Z][A-Z_]*\.md$/, // root-level README.md, AGENTS.md, etc.
];

const SKIP = new Set([
  'STATE.md',
  'TODO.md',
  'TODO2.md',
  'ui/TODO.md',
  'CHANGELOG.md',
  // Self-skip: this script's own regex literal + cluster-word list
  // contain the very tokens it flags. Without this entry, every run
  // flags itself.
  'scripts/system/verify-english-only.mjs',
  // The unit-test file deliberately contains Spanish text fixtures
  // to verify the detector. Skip it for the same reason.
  'scripts/system/verify-english-only.test.mjs',
]);

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter((p) => p.length > 0);
}

function shouldScan(rel) {
  if (SKIP.has(rel)) return false;
  return SCAN_GLOBS.some((re) => re.test(rel));
}

// Run as script (not as imported module).
if (import.meta.url === `file://${process.argv[1]}`) {
  const tracked = listTrackedFiles();
  const targets = tracked.filter(shouldScan);

  let total = 0;
  const reports = [];
  for (const rel of targets) {
    let text;
    try {
      text = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    const offenders = findOffenders(text);
    if (offenders.length) {
      total += offenders.length;
      reports.push({ rel, offenders });
    }
  }

  if (total === 0) {
    console.log(`OK verify-english-only - ${targets.length} file(s) scanned, 0 offenders.`);
    process.exit(0);
  }

  console.error('');
  console.error(
    `FAIL verify-english-only - ${total} offending line(s) across ${reports.length} file(s):`,
  );
  console.error('');
  for (const { rel, offenders } of reports) {
    for (const { line, text, reason, detail } of offenders) {
      const tag = reason === 'spanish-cluster' ? `[cluster: ${detail}]` : '[accented]';
      console.error(`  ${rel}:${line}  ${tag}  ${text.slice(0, 100)}`);
    }
  }
  console.error('');
  console.error(
    'Translate non-English prose, or extend ACCENTED_ALLOWLIST / SPANISH_CLUSTER_WORDS',
  );
  console.error('in scripts/system/verify-english-only.mjs when adding legitimate exceptions.');
  process.exit(1);
}
