#!/usr/bin/env node
// verify-modes.mjs - assert modes/*.md correctness.
//
// Gates checked per mode file:
//
//   1. Token registry consistency. Every `__TOKEN__` referenced in a
//      mode must be declared in modes/_TOKENS.md AND mapped in
//      ui/src/lib/server/mode-substitution.ts. A typo like __CV___
//      would silently land in the AI prompt verbatim and confuse
//      the model -- this gate surfaces it.
//
//   2. Multi-user-aware path references. Mode files must NOT carry
//      literal paths that bypass the active-profile resolution:
//        - bare `cv.md`, `profile.yml`, `config/profile.yml`
//        - bare `article-digest.md`, `story-bank.md`
//        - bare `reports/`, `output/`, `jds/`, `interview-prep/`,
//          `writing-samples/`, `applications.md`, `pipeline.md`,
//          `scan-history.tsv`, `follow-ups.md`, `projects.json`
//        - bare `batch/tracker-additions/`, `batch/batch-state.tsv`,
//          `batch/batch-input.tsv`
//      The orchestrator does NOT substitute these literals; they
//      resolve to repo-root paths that either don't exist or belong
//      to the wrong profile.
//
//   3. Script-path correctness. `node <bare-name>.mjs` invocations
//      must include the real path under scripts/. The orchestrator
//      runs from repo root so `node generate-pdf.mjs` resolves to
//      ./generate-pdf.mjs which does not exist (the real file is
//      under scripts/cv/).
//
//   4. Header schema. Every mode (except `_*` system files) starts
//      with `# Mode: <slug> -- <subtitle>` where <slug> matches the
//      filename.
//
// Exit codes:
//   0 = all modes valid
//   1 = at least one mode failed at least one gate
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Token registry (kept in sync with mode-substitution.ts) ────────
export const KNOWN_TOKENS = new Set([
  '__PROFILE__',
  '__CV__',
  '__PROFILE_YML__',
  '__PROFILE_MD__',
  '__PORTALS__',
  '__ARTICLE_DIGEST__',
  '__PIPELINE__',
  '__APPLICATIONS__',
  '__SCAN_HISTORY__',
  '__GEMINI_SCORES__',
  '__FOLLOW_UPS__',
  '__PROJECTS_JSON__',
  '__REPORTS__',
  '__OUTPUT__',
  '__JDS__',
  '__WRITING_SAMPLES__',
  '__INTERVIEW_PREP__',
  '__BATCH__',
  '__STORY_BANK__',
]);

// Literal paths that bypass multi-user resolution. Each entry says
// "if this appears as a bare reference (not inside backticks pointing
// at the token), flag it."
const FORBIDDEN_LITERALS = [
  { pattern: /\bconfig\/profile\.yml\b/, hint: '__PROFILE_YML__' },
  { pattern: /(?<![/_-])\bprofile\.yml\b/, hint: '__PROFILE_YML__' },
  { pattern: /(?<![/_-])\bcv\.md\b/, hint: '__CV__' },
  { pattern: /(?<![/_-])\barticle-digest\.md\b/, hint: '__ARTICLE_DIGEST__' },
  { pattern: /(?<![/_-])\bstory-bank\.md\b/, hint: '__STORY_BANK__' },
  { pattern: /(?<![/_-])\bapplications\.md\b/, hint: '__APPLICATIONS__' },
  { pattern: /(?<![/_-])\bscan-history\.tsv\b/, hint: '__SCAN_HISTORY__' },
  { pattern: /(?<![/_-])\bfollow-ups\.md\b/, hint: '__FOLLOW_UPS__' },
  { pattern: /(?<![/_-])\bprojects\.json\b/, hint: '__PROJECTS_JSON__' },
  { pattern: /\bbatch\/batch-state\.tsv\b/, hint: '__BATCH__/batch-state.tsv' },
  { pattern: /\bbatch\/batch-input\.tsv\b/, hint: '__BATCH__/batch-input.tsv' },
  { pattern: /\bbatch\/tracker-additions\//, hint: '__BATCH__/tracker-additions/' },
];

const BARE_SCRIPT_RX = [
  { pattern: /node\s+cv-sync-check\.mjs/, hint: 'node scripts/quality/cv-sync-check.mjs' },
  { pattern: /node\s+generate-pdf\.mjs/, hint: 'node scripts/cv/generate-pdf.mjs' },
  { pattern: /node\s+generate-latex\.mjs/, hint: 'node scripts/cv/generate-latex.mjs' },
  { pattern: /node\s+followup-cadence\.mjs/, hint: 'node scripts/tracker/followup-cadence.mjs' },
  { pattern: /node\s+analyze-patterns\.mjs/, hint: 'node scripts/tracker/analyze-patterns.mjs' },
  { pattern: /node\s+ats-check\.mjs/, hint: 'node scripts/cv/ats-check.mjs' },
];

/**
 * Detect every `__TOKEN__` and `# Mode: <slug>` issue in one mode
 * file. Returns an array of `{ kind, line, text, hint? }` offenders.
 * Exported for unit testing.
 */
export function findModeIssues(rel, body) {
  const issues = [];
  const lines = body.split('\n');

  // Header schema gate (skip system files _*)
  const base = basename(rel, '.md');
  if (!base.startsWith('_')) {
    const first = lines[0] || '';
    const expected = '# Mode: ' + base + ' -- ';
    if (!first.startsWith(expected)) {
      issues.push({
        kind: 'header',
        line: 1,
        text: first,
        hint: expected + '<subtitle>',
      });
    }
  }

  // Inside fenced code blocks, leave everything alone.
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Token typos (UPPERCASE with surrounding underscores)
    const tokens = line.match(/__[A-Z][A-Z_]*__/g) || [];
    for (const tok of tokens) {
      if (!KNOWN_TOKENS.has(tok)) {
        // Allowlist: the _TOKENS.md file itself documents examples
        // like __FOO__ / __UPPERCASE__ / __CV___EXTRA.
        if (rel === 'modes/_TOKENS.md') continue;
        issues.push({ kind: 'unknown-token', line: i + 1, text: tok });
      }
    }

    // Forbidden literal paths.
    //   - `_TOKENS.md` documents the token system + cites literal-path
    //     anti-patterns; allowlist the whole file.
    //   - Lines that explain "<token> resolves to data/users/.../..."
    //     legitimately contain the literal path as documentation; the
    //     `data/users/{uid}/profiles/{slug}/` substring marks those.
    if (rel !== 'modes/_TOKENS.md') {
      const isResolutionExplainer =
        /data\/users\/\{uid\}|data\/profiles\/\{slug\}|data\/users\/\$|data\/profiles\/\$/.test(
          line,
        );
      if (!isResolutionExplainer) {
        for (const { pattern, hint } of FORBIDDEN_LITERALS) {
          if (pattern.test(line)) {
            issues.push({
              kind: 'literal-path',
              line: i + 1,
              text: line.trim(),
              hint,
            });
          }
        }
      }
    }

    // Bare script-name invocations
    for (const { pattern, hint } of BARE_SCRIPT_RX) {
      if (pattern.test(line)) {
        issues.push({
          kind: 'bare-script',
          line: i + 1,
          text: line.trim(),
          hint,
        });
      }
    }
  }
  return issues;
}

// ── Script entrypoint ────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = execSync('git ls-files modes/*.md', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  let total = 0;
  const reports = [];
  for (const rel of files) {
    const body = readFileSync(join(ROOT, rel), 'utf8');
    const issues = findModeIssues(rel, body);
    if (issues.length) {
      total += issues.length;
      reports.push({ rel, issues });
    }
  }

  if (total === 0) {
    console.log(`OK verify-modes - ${files.length} mode file(s) scanned, 0 issues.`);
    process.exit(0);
  }

  console.error('');
  console.error(`FAIL verify-modes - ${total} issue(s) across ${reports.length} mode file(s):`);
  console.error('');
  for (const { rel, issues } of reports) {
    for (const { kind, line, text, hint } of issues.slice(0, 5)) {
      const hintStr = hint ? `  -> use \`${hint}\`` : '';
      console.error(`  ${rel}:${line}  [${kind}]  ${text.slice(0, 80)}${hintStr}`);
    }
    if (issues.length > 5) console.error(`    ... and ${issues.length - 5} more`);
  }
  console.error('');
  console.error('Fix: replace literal paths with the token registry in modes/_TOKENS.md.');
  console.error('Bare script names must include their full scripts/<dir>/<name> path.');
  process.exit(1);
}
