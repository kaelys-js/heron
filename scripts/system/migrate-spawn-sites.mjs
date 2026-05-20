#!/usr/bin/env node
/**
 * migrate-spawn-sites.mjs -- refactor every AI-CLI spawn site to use
 * spawnAgentWithMode(). One-shot codemod.
 *
 * Strategy: find each spawn block by anchor lines, extract the whole
 * region, rewrite it. Two helpers:
 *
 *   - rewriteSpawnBlock(src, blockStart, blockEnd) → modifies in
 *     place by capturing the mode, input, profileId expr, env extras.
 *   - cleanupImports(src) → drops imports that are no longer used.
 *
 * Anchors used to find blocks:
 *   - START: `const prompt = '/' + CLI_NAMESPACE` (line)
 *   - END:   the `});` that closes the matching `spawn(AGENT_CLI, ...)` call
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const FILES = execSync(
  'git grep -lE "swapProfileSymlinks|spawn\\(AGENT_CLI" -- "ui/src/routes/" "ui/src/lib/server/orchestrator.ts"',
  { cwd: REPO_ROOT, encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter((f) => !f.includes('.test.'))
  .filter(Boolean);

/** Find one spawn block in `src` starting at `fromIdx`. Returns
 *  { startIdx, endIdx, blockText } or null if no more blocks. */
function findNextBlock(src, fromIdx) {
  // Block starts at the line containing `const prompt = '/' + CLI_NAMESPACE`
  const promptStart = src.indexOf('const prompt =', fromIdx);
  if (promptStart === -1) return null;
  // Walk back to line start
  let startIdx = promptStart;
  while (startIdx > 0 && src[startIdx - 1] !== '\n') startIdx -= 1;

  // End at the next `});` that closes a `spawn(AGENT_CLI` call
  // ahead of the prompt.
  const spawnPos = src.indexOf('spawn(AGENT_CLI', promptStart);
  if (spawnPos === -1) return null;
  // Find the matching `});` -- naive: search for `});` after spawnPos.
  // The spawn call is one-deep so this is OK.
  const closePos = src.indexOf('});', spawnPos);
  if (closePos === -1) return null;
  const endIdx = closePos + 3; // include `});`

  return { startIdx, endIdx, blockText: src.slice(startIdx, endIdx) };
}

/** Given a spawn block (text), build the replacement. */
function rewriteBlock(blockText) {
  // Normalise multi-line prompt to single line.
  const norm = blockText.replace(/\s*\n\s*/g, ' ');

  // Capture mode name + payload (input)
  const promptMatch = norm.match(
    /const prompt = '\/' \+ CLI_NAMESPACE \+ ' ([a-z][a-z0-9-]*)([^']*)' \+ ([^;]+);/,
  );
  if (!promptMatch) return null;
  const mode = promptMatch[1];
  const argsTail = promptMatch[2]; // e.g. " " or " --tone "
  const inputExpr = promptMatch[3].trim();

  // Build the user-message expression. If argsTail is just a space, the
  // tail evaporates. If it carries flag text, concat to input.
  let userMsg = inputExpr;
  const argsTrimmed = argsTail.trim();
  if (argsTrimmed) {
    userMsg = `${inputExpr} + ' ${argsTrimmed} '`;
  }

  // Capture profileId from `swapProfileSymlinks(<expr>)`
  const profileMatch = norm.match(/swapProfileSymlinks\(\s*([a-zA-Z_$][\w$.]*)\s*\)/);
  const profileExpr = profileMatch ? profileMatch[1] : 'profileId';

  // Capture child var name from `const <name> = spawn(`
  const childMatch = norm.match(/const (\w+) = spawn\(AGENT_CLI/);
  const childVar = childMatch ? childMatch[1] : 'p';

  // Capture env block. The spawn options look like `{ cwd: ROOT, env: <expr> }`.
  // Extract the env expression with a balanced-brace scan -- the prior
  // version used a regex with nested `[^}]*` quantifiers which CodeQL
  // flags as `js/redos` (catastrophic backtracking on adversarial input).
  // For a one-shot migration script that's harmless in practice, but
  // the simpler linear scan also handles deeper nesting correctly.
  function extractEnvLiteral(text) {
    const anchor = text.indexOf('env:');
    if (anchor < 0) return null;
    let i = text.indexOf('{', anchor);
    if (i < 0) return null;
    const start = i;
    let depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
  const envExpr = extractEnvLiteral(norm);
  let envArg = '';
  if (envExpr) {
    // If env is just `{ ...process.env }`, drop. Otherwise extract extras.
    if (envExpr.trim() === '{ ...process.env }') {
      // no extras
    } else {
      const inner = envExpr.replace(/^\{/, '').replace(/\}$/, '').trim();
      const cleaned = inner
        .replace(/\.\.\.process\.env\s*,?/g, '')
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '')
        .trim();
      if (cleaned) {
        envArg = `,\n      env: { ${cleaned} }`;
      }
    }
  }

  // Build the replacement
  return `\n    const { child: ${childVar} } = spawnAgentWithMode('${mode}', ${userMsg}, {\n      profileId: ${profileExpr}${envArg},\n    });`;
}

function cleanupImports(src) {
  let out = src;

  // Drop swapProfileSymlinks import
  out = out.replace(
    /^import \{ swapProfileSymlinks \} from '\$lib\/server\/profile-symlinks';\n/gm,
    '',
  );

  // Drop CLI_NAMESPACE import if no more references
  if (
    !/\bCLI_NAMESPACE\b/.test(
      out.replace(/^import \{ CLI_NAMESPACE \} from '\$lib\/config\/branding';\n/m, ''),
    )
  ) {
    out = out.replace(/^import \{ CLI_NAMESPACE \} from '\$lib\/config\/branding';\n/gm, '');
  }

  // Drop AGENT_CLI import if no more references
  if (
    !/\bAGENT_CLI\b/.test(out.replace(/^import \{ AGENT_CLI \} from '\$lib\/config\/cli';\n/m, ''))
  ) {
    out = out.replace(/^import \{ AGENT_CLI \} from '\$lib\/config\/cli';\n/gm, '');
  }

  // Drop spawn import if no more spawn( calls
  if (
    !/\bspawn\(/.test(out.replace(/^import \{ spawn[^}]*\} from 'node:child_process';\n/gm, ''))
  ) {
    out = out.replace(/^import \{ spawn[^}]*\} from 'node:child_process';\n/gm, '');
  }

  // Drop ROOT import if no more uses
  if (!/\bROOT\b/.test(out.replace(/^import \{ ROOT \} from '\$lib\/server\/files';\n/gm, ''))) {
    out = out.replace(/^import \{ ROOT \} from '\$lib\/server\/files';\n/gm, '');
  }

  // Add spawnAgentWithMode import if not present. Insert AFTER the
  // last complete import statement (which may span multiple lines --
  // `import { A, B } from 'x';` form) so we don't bisect a multi-line
  // import.
  if (!/spawn-agent/.test(out) && /spawnAgentWithMode/.test(out)) {
    // Find the position right after the last `from '...';` (or `'...';"`)
    // line, treating that as the end of the imports block.
    const importEndRe = /^import [\s\S]*?from ['"][^'"]+['"];?\s*$/gm;
    let lastEnd = -1;
    for (const m of out.matchAll(importEndRe)) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd >= 0) {
      out =
        out.slice(0, lastEnd) +
        "\nimport { spawnAgentWithMode } from '$lib/server/spawn-agent';" +
        out.slice(lastEnd);
    } else {
      out = "import { spawnAgentWithMode } from '$lib/server/spawn-agent';\n" + out;
    }
  }

  // Drop stray try { swapProfileSymlinks(...); } catch {} blocks (may
  // remain if the spawn block extraction didn't include them)
  out = out.replace(
    /\s*try\s*\{\s*swapProfileSymlinks\([^)]*\);\s*\}\s*catch\s*\{[^}]*\}\s*/g,
    '\n    ',
  );

  // Drop `if (...) swapProfileSymlinks(...);` one-liners
  out = out.replace(/\s*if\s*\([^)]+\)\s*swapProfileSymlinks\([^)]*\);\s*/g, '\n    ');

  return out;
}

let touched = 0;
let skipped = 0;
const report = [];

for (const rel of FILES) {
  const abs = resolve(REPO_ROOT, rel);
  const original = readFileSync(abs, 'utf8');
  let src = original;

  // Repeatedly find + rewrite each spawn block until no more remain.
  let blockCount = 0;
  let scanFrom = 0;
  while (true) {
    const block = findNextBlock(src, scanFrom);
    if (!block) break;
    const replacement = rewriteBlock(block.blockText);
    if (replacement == null) {
      // Couldn't parse this block -- abort for this file
      report.push(`  ⚠ ${rel}  (failed to parse spawn block @${block.startIdx})`);
      src = original;
      break;
    }
    src = src.slice(0, block.startIdx) + replacement + src.slice(block.endIdx);
    blockCount += 1;
    scanFrom = block.startIdx + replacement.length;
  }

  if (src !== original) {
    src = cleanupImports(src);
    writeFileSync(abs, src);
    touched += 1;
    report.push(`  ✓ ${rel}  (${blockCount} spawn site${blockCount === 1 ? '' : 's'})`);
  } else {
    skipped += 1;
    report.push(`  · ${rel}  (no changes)`);
  }
}

console.log(report.join('\n'));
console.log(`\n✓ Migrated ${touched} files. Skipped ${skipped} (no changes).`);
