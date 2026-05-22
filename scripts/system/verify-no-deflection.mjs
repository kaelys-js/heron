#!/usr/bin/env node
/**
 * verify-no-deflection.mjs -- block commits that deflect approved work.
 *
 * The user explicitly forbade a recurring pattern: when I hit friction
 * on approved work, I would downgrade scope ("MVP", "follow-up", "out
 * of scope", "separate ticket", "for now", "simplify to", "punt").
 * Verbal commitments to stop weren't enough; the user required a
 * STRUCTURAL gate.
 *
 * Two modes:
 *   --staged           pre-commit: scan `git diff --cached --diff-filter=AM`
 *                      additions for the forbidden vocabulary.
 *   --message <path>   commit-msg: scan the commit message at <path>.
 *
 * Forbidden vocabulary (regex, word-boundary):
 *   MVP | defer | out of scope | won't fit | future PR | future work |
 *   separate ticket | separate PR | follow-up | simplify to | for now |
 *   punt | leave for now
 *
 * Bypass: the literal string [user-approved-deferral] in EITHER the
 * commit message body OR a code-comment trailer in the same hunk
 * explicitly approves the deferral. Use only when the user has
 * granted permission to defer specific work.
 *
 * Exemptions (the script auto-allows these so it doesn't false-positive
 * on itself or on legitimate historical references):
 *   - scripts/system/verify-no-deflection.{mjs,test.mjs}  (self)
 *   - AGENTS.md  (Rule 13 enumerates the vocab as policy)
 *   - CHANGELOG.md
 *   - docs/archive/**
 *
 * Exit codes:
 *   0 -- no deflection found, OR a hit was bypassed
 *   1 -- deflection found in staged diff or commit message
 *   2 -- usage / argument error
 *
 * Test fixtures live in scripts/system/verify-no-deflection.test.mjs.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFLECTION_REGEX =
  /\b(MVP|defer(?:red|ral|ring)?|out[- ]of[- ]scope|won['’]?t fit|future PR|future work|separate ticket|separate PR|follow[- ]?up|simplify to|for now|punt(?:ed|ing)?|leave for now)\b/i;

export const BYPASS_TOKEN = '[user-approved-deferral]';

const EXEMPT_PATHS = [
  /^scripts\/system\/verify-no-deflection\.(mjs|test\.mjs)$/,
  /^AGENTS\.md$/,
  /^CHANGELOG\.md$/,
  /^docs\/archive\//,
  // lefthook.yml itself enumerates the forbidden vocab in the
  // no-deflect step's docstring (same rationale as AGENTS.md Rule 13).
  /^lefthook\.yml$/,
];

/**
 * Check whether a given file path is exempt from the deflection scan.
 * Exempt paths can mention the forbidden vocabulary without triggering
 * a failure (e.g. AGENTS.md Rule 13 lists the vocab as policy).
 */
export function isExemptPath(relPath) {
  return EXEMPT_PATHS.some((rx) => rx.test(relPath));
}

/**
 * Find every deflection hit in a body of text. Returns an array of
 * { line, lineNo, match } for callers to format + report.
 *
 * `lineNoOffset` is the 1-based index of the first line in `body`
 * (used so the caller can map hunk-relative line numbers back to
 * file-absolute ones).
 */
export function scanBody(body, lineNoOffset = 1) {
  const hits = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(BYPASS_TOKEN)) continue; // bypass annotation
    const m = line.match(DEFLECTION_REGEX);
    if (m) {
      hits.push({ line, lineNo: lineNoOffset + i, match: m[0] });
    }
  }
  return hits;
}

/**
 * Pre-commit mode: scan the staged diff. Hunks live in files; group
 * hits by file so the report is readable. Skip exempt files entirely.
 */
function runStaged() {
  let diff;
  try {
    diff = execSync('git diff --cached --diff-filter=AM --unified=0', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    console.error('::error::verify-no-deflection: git diff failed:', e.message);
    return 2;
  }

  // Parse the unified diff into per-file hunks. We only inspect `+`
  // additions (new content). Lines starting with `+++` are headers.
  const hunks = [];
  let currentFile = null;
  let currentLineNo = 0;
  for (const rawLine of diff.split('\n')) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = rawLine.slice(6);
      continue;
    }
    if (rawLine.startsWith('@@')) {
      // @@ -<old>,<n> +<new>,<m> @@
      const m = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) currentLineNo = Number.parseInt(m[1], 10);
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      hunks.push({ file: currentFile, lineNo: currentLineNo, body: rawLine.slice(1) });
      currentLineNo += 1;
    } else if (!rawLine.startsWith('-')) {
      // context lines advance the new-line counter too (but we don't
      // scan them; only added lines).
      if (currentLineNo > 0) currentLineNo += 1;
    }
    // `-` lines stay at currentLineNo (they're removals; new file's
    // line numbers don't advance).
  }

  const hitsByFile = new Map();
  for (const hunk of hunks) {
    if (!hunk.file || isExemptPath(hunk.file)) continue;
    const hits = scanBody(hunk.body, hunk.lineNo);
    if (hits.length === 0) continue;
    if (!hitsByFile.has(hunk.file)) hitsByFile.set(hunk.file, []);
    hitsByFile.get(hunk.file).push(...hits);
  }

  if (hitsByFile.size === 0) return 0;

  console.error('::error::Deflection language detected in staged diff.');
  console.error('');
  console.error('The user has explicitly forbidden these words on approved work:');
  for (const [file, hits] of hitsByFile) {
    console.error(`  ${file}:`);
    for (const h of hits) {
      console.error(`    line ${h.lineNo}: ${h.match}  "${h.line.trim().slice(0, 100)}"`);
    }
  }
  console.error('');
  console.error('If this is a real, user-approved deferral, include the literal');
  console.error(`  ${BYPASS_TOKEN}`);
  console.error('in either the commit message body OR a code-comment trailer in');
  console.error('the same hunk. The commit-msg gate then allows the diff hit.');
  return 1;
}

/**
 * Commit-msg mode: scan the message file. If the message contains
 * the bypass token, the diff-side check (already run via the staged
 * mode above) gets retroactively cleared by lefthook's failure-
 * suppression -- but in practice we check independently here. The
 * commit-msg gate also catches deflection language inside the message
 * itself.
 */
function runMessage(path) {
  if (!existsSync(path)) {
    console.error(`::error::verify-no-deflection: message file not found: ${path}`);
    return 2;
  }
  const body = readFileSync(path, 'utf8');
  if (body.includes(BYPASS_TOKEN)) return 0;
  const hits = scanBody(body);
  if (hits.length === 0) return 0;
  console.error('::error::Deflection language detected in commit message.');
  console.error('');
  for (const h of hits) {
    console.error(`  line ${h.lineNo}: ${h.match}  "${h.line.trim().slice(0, 100)}"`);
  }
  console.error('');
  console.error('If this is a real, user-approved deferral, include the literal');
  console.error(`  ${BYPASS_TOKEN}`);
  console.error('somewhere in the commit message body.');
  return 1;
}

function usage() {
  console.error('Usage:');
  console.error('  verify-no-deflection.mjs --staged');
  console.error('  verify-no-deflection.mjs --message <path-to-commit-msg-file>');
  return 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--staged') {
    return runStaged();
  }
  if (args[0] === '--message' && args[1]) {
    return runMessage(args[1]);
  }
  return usage();
}

// Test-only: skip main() when imported as a module by the test file.
//
// Previously this used `import.meta.url === \`file://${process.argv[1]}\``
// which silently broke on macOS (where /tmp is a symlink to /private/tmp,
// causing the URL ↔ argv path comparison to never match) AND when argv[1]
// was a relative path. The bug meant `process.exit(main())` NEVER ran,
// so the hook logged errors but always exited 0 -- it was a no-op gate.
//
// Fix: compare REALPATHs via Node's `fileURLToPath` + `realpathSync`.
// Identical resolution on both sides so symlinks + relative paths
// round-trip correctly.
const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (scriptPath === argvPath) {
  process.exit(main());
}
