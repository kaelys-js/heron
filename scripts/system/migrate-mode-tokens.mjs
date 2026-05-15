#!/usr/bin/env node
/**
 * migrate-mode-tokens.mjs — one-shot codemod that rewrites every
 * `modes/*.md` file from literal repo-root paths (legacy symlink
 * convention) to the `__TOKEN__` vocabulary documented in
 * `modes/_TOKENS.md`.
 *
 * Idempotent: running again on already-migrated files is a no-op
 * because the regexes only match literal paths, not tokens.
 *
 * Skipped:
 *   - modes/_TOKENS.md itself (it documents the legacy paths)
 *   - modes/_profile.template.md (template seed — kept as readable
 *     example for users authoring their own _profile.md)
 *
 * Replacement order matters — longer paths first to avoid partial
 * matches (e.g. `interview-prep/story-bank.md` must replace before
 * `interview-prep/`).
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODES_DIR = resolve(__dirname, '..', '..', 'modes');

// Ordered: longest/most-specific first.
const REPLACEMENTS = [
  // Compound path — story-bank.md is user-shared, NOT inside interview-prep
  [/\binterview-prep\/story-bank\.md\b/g, '__STORY_BANK__'],
  // Pre-existing curly-brace placeholders that some modes already use
  [/\{output-dir\}/g, '__OUTPUT__'],
  [/\{interview-prep-dir\}/g, '__INTERVIEW_PREP__'],
  [/\{reports-dir\}/g, '__REPORTS__'],
  [/\{profile-dir\}/g, '__PROFILE__'],
  [/\{jds-dir\}/g, '__JDS__'],
  [/\{writing-samples-dir\}/g, '__WRITING_SAMPLES__'],
  // Per-profile dirs (must come BEFORE single-file replacements that
  // happen to be inside these dirs)
  [/\binterview-prep\//g, '__INTERVIEW_PREP__/'],
  [/\bwriting-samples\//g, '__WRITING_SAMPLES__/'],
  [/\bjds\//g, '__JDS__/'],
  [/\breports\//g, '__REPORTS__/'],
  [/\boutput\//g, '__OUTPUT__/'],
  // Per-profile single files (word-bounded so they don't match inside
  // longer identifiers)
  [/\bcv\.md\b/g, '__CV__'],
  [/\bmodes\/_profile\.md\b/g, '__PROFILE_MD__'],
  [/\b_profile\.md\b/g, '__PROFILE_MD__'],
  [/\bportals\.yml\b/g, '__PORTALS__'],
  [/\barticle-digest\.md\b/g, '__ARTICLE_DIGEST__'],
  [/\bpipeline\.md\b/g, '__PIPELINE__'],
  [/\bapplications\.md\b/g, '__APPLICATIONS__'],
  [/\bscan-history\.tsv\b/g, '__SCAN_HISTORY__'],
  [/\bgemini-scores\.tsv\b/g, '__GEMINI_SCORES__'],
  [/\bfollow-ups\.md\b/g, '__FOLLOW_UPS__'],
  [/\bprojects\.json\b/g, '__PROJECTS_JSON__'],
];

// Files we don't migrate (see header).
const SKIP_FILES = new Set(['_TOKENS.md', '_profile.template.md']);

let totalEdits = 0;
let touchedFiles = 0;
const summary = [];

function* walkMd(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkMd(full);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      yield full;
    }
  }
}

for (const path of walkMd(MODES_DIR)) {
  const rel = path.slice(MODES_DIR.length + 1);
  if (SKIP_FILES.has(rel) || rel.startsWith('archive/')) continue;
  const src = readFileSync(path, 'utf8');
  let out = src;
  let fileEdits = 0;
  for (const [re, replacement] of REPLACEMENTS) {
    const before = out;
    out = out.replace(re, replacement);
    if (out !== before) {
      // Count how many substitutions happened
      const matches = before.match(re);
      fileEdits += matches ? matches.length : 0;
    }
  }
  if (out !== src) {
    writeFileSync(path, out);
    totalEdits += fileEdits;
    touchedFiles += 1;
    summary.push(`  ✓ ${rel}  (${fileEdits} substitutions)`);
  }
}

console.log(summary.join('\n'));
console.log(`\n✓ Migrated ${totalEdits} path tokens across ${touchedFiles} mode files.`);
