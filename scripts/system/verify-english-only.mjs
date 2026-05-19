#!/usr/bin/env node
/**
 * verify-english-only.mjs — enforce English-only system layer.
 *
 * Heron ships English-only mode templates (locale dirs were dropped in
 * commit 7e3fd99; the `modes_dir` hook in profile.yml still lets a user
 * point at a restored localized directory of their own). This script
 * guards against accidental re-introduction of Spanish prose in the
 * system layer.
 *
 * What it scans:
 *   - Every tracked .md under modes/, docs/, scripts/, branding/, .github/
 *   - Every tracked .ts / .tsx / .svelte / .mjs / .py under ui/src/, scripts/
 *   - The root-level .md set (README.md, AGENTS.md, GEMINI.md, CLAUDE.md)
 *
 * What it allows:
 *   - English loan words containing accented chars (cliché, résumé, fiancé, …)
 *   - Proper nouns containing accents (Bogotá, São Paulo, …)
 *   - Foreign-language regex patterns used as data (e.g. liveness-core.mjs
 *     matches "offre expirée" to detect French expired-job pages)
 *   - User-personal scratchpads (STATE.md, TODO*.md — gitignored anyway)
 *   - Generated reports / data / writing-samples (per-user content, gitignored)
 *
 * The allowlist below is the explicit set of accented strings that are
 * legitimate inside the system layer. Anything else that surfaces as a
 * Spanish-style accented character causes a non-zero exit.
 *
 * Usage:
 *   node scripts/system/verify-english-only.mjs
 *
 * Exit codes:
 *   0 = clean
 *   1 = found unaccounted-for Spanish-style accented strings
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Words and short phrases that legitimately appear in English-language prose.
// Match must be exact (case-insensitive) — every accented occurrence in a
// tracked file must reduce to one of these via case-folded substring lookup.
const ALLOWLIST = [
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

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter((p) => p.length > 0);
}

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
  'STATE.md', // session scratchpad, gitignored
  'TODO.md',
  'TODO2.md',
  'ui/TODO.md',
  'CHANGELOG.md', // auto-generated
  // Self-skip: this script's own regex literal contains the accented chars
  // it's trying to detect. Without this entry, every run flags itself.
  'scripts/system/verify-english-only.mjs',
]);

function shouldScan(rel) {
  if (SKIP.has(rel)) return false;
  return SCAN_GLOBS.some((re) => re.test(rel));
}

function findOffenders(text) {
  if (!ACCENTED.test(text)) return [];
  const lines = text.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ACCENTED.test(line)) continue;
    // Extract accented word-tokens. Strip surrounding punctuation (apostrophes,
    // quotes, parens, commas) so 'Clichés' or "résumé," reduces to the bare word.
    const tokens = (line.match(/[A-Za-zÀ-ÿ'’]+/g) ?? []).map((t) =>
      t.replace(/^['’"]+|['’",.;:!?)]+$/g, ''),
    );
    const accentedTokens = tokens.filter((t) => ACCENTED.test(t));
    const lineLower = line.toLowerCase();
    let allLineCovered = true;
    for (const tok of accentedTokens) {
      const tokLower = tok.toLowerCase();
      // Pass if any allowlist entry (case-folded) matches this token OR
      // the line contains an allowlist phrase verbatim around this token.
      const okWord = ALLOWLIST.some((a) => a.toLowerCase() === tokLower);
      const okPhrase = ALLOWLIST.some(
        (a) => a.includes(' ') && lineLower.includes(a.toLowerCase()),
      );
      if (!okWord && !okPhrase) {
        allLineCovered = false;
        break;
      }
    }
    if (!allLineCovered) offenders.push({ line: i + 1, text: line.trim() });
  }
  return offenders;
}

const tracked = listTrackedFiles();
const targets = tracked.filter(shouldScan);

let totalOffenders = 0;
const fileReports = [];
for (const rel of targets) {
  let text;
  try {
    text = readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    continue; // file disappeared mid-scan; skip
  }
  const offenders = findOffenders(text);
  if (offenders.length) {
    totalOffenders += offenders.length;
    fileReports.push({ rel, offenders });
  }
}

if (totalOffenders === 0) {
  console.log(
    `✓ verify-english-only — ${targets.length} file(s) scanned, 0 unaccounted-for accented strings.`,
  );
  process.exit(0);
}

console.error('');
console.error(
  `✗ verify-english-only — ${totalOffenders} offending line(s) across ${fileReports.length} file(s):`,
);
console.error('');
for (const { rel, offenders } of fileReports) {
  for (const { line, text } of offenders) {
    console.error(`  ${rel}:${line}  ${text}`);
  }
}
console.error('');
console.error('If these are legitimate English loan words (cliché, résumé, …) or proper nouns,');
console.error(
  'add them to ALLOWLIST in scripts/system/verify-english-only.mjs. Otherwise, translate.',
);
process.exit(1);
