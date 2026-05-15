#!/usr/bin/env node
/**
 * fix-md040.mjs — one-shot codemod that adds a language tag to every
 * bare ``` fence that MD040 (markdownlint) is flagging.
 *
 * Why a codemod and not `markdownlint-cli2 --fix`: --fix cannot pick a
 * language, so MD040 is left as a remaining error. We pick a tag based
 * on a content heuristic, defaulting to `text` (markdownlint's "this
 * is opaque output, no syntax highlighting wanted" generic tag).
 *
 * Heuristic ladder (first match wins):
 *   1. starts with `$` / `pnpm ` / `npm ` / `node ` / `git ` / `brew ` → `bash`
 *   2. starts with `{` AND looks JSON-shaped              → `json`
 *   3. starts with `<`                                    → `xml`
 *   4. contains `:` early AND looks YAML-shaped           → `yaml`
 *   5. contains `├──` / `└──` / `│`  (tree drawings)      → `text`
 *   6. fallback                                            → `text`
 *
 * Run AFTER `markdownlint-cli2 --fix` so MD034/MD037 are already fixed.
 * Invocation: `node scripts/system/fix-md040.mjs`
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// ── Step 1: ask markdownlint-cli2 where MD040 violations live ────────
// markdownlint-cli2 writes its report to STDERR (not stdout) and exits
// with code 1 when it finds violations. We capture both streams and
// concatenate — the `path:line error MDxxx ...` lines come from stderr.
// Format produced: `<path>:<line>[:col] error MDxxx ...`
const result = spawnSync('pnpm', ['exec', 'markdownlint-cli2'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const raw = (result.stdout ?? '') + (result.stderr ?? '');
if (!raw) {
  console.log('No markdownlint output captured — exiting.');
  process.exit(0);
}

// `<path>:<line>[:col] error MDxxx ...` — the second segment may have
// trailing tokens like "52 error MD040 ...". `Number()` returns NaN
// when there's trailing non-numeric content; `parseInt` does what we
// want here.
const md040 = raw
  .split('\n')
  .filter((line) => line.includes('MD040/'))
  .map((line) => {
    const [path, lineSegment] = line.split(':');
    return { path, lineNo: parseInt(lineSegment, 10) };
  })
  .filter((v) => v.path && Number.isFinite(v.lineNo));

if (md040.length === 0) {
  console.log('✓ No MD040 violations found.');
  process.exit(0);
}

// ── Step 2: group by file ────────────────────────────────────────────
const byFile = new Map();
for (const { path, lineNo } of md040) {
  if (!byFile.has(path)) byFile.set(path, new Set());
  byFile.get(path).add(lineNo);
}

// ── Step 3: per-file patch ────────────────────────────────────────────
function pickLang(blockContent) {
  const first = blockContent.split('\n').find((l) => l.trim()) ?? '';
  const stripped = first.trim();

  if (
    /^\$\s/.test(stripped) ||
    /^(pnpm|npm|node|git|brew|mise|cd|bash|sh|curl|export|chmod|find|grep|sed|awk|ls|cat|mkdir|rm|cp|mv|ssh|scp|tar|zip|unzip|docker|kubectl|fastlane|gh|bundle) /.test(
      stripped,
    )
  ) {
    return 'bash';
  }
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    return 'json';
  }
  if (stripped.startsWith('<')) {
    return 'xml';
  }
  if (/^[a-zA-Z_][\w-]*:\s/.test(stripped)) {
    return 'yaml';
  }
  if (blockContent.includes('├──') || blockContent.includes('└──') || blockContent.includes('│')) {
    return 'text';
  }
  return 'text';
}

let totalFixed = 0;

for (const [path, lines] of byFile) {
  const src = readFileSync(path, 'utf8');
  const srcLines = src.split('\n');

  // For each violating line, scan forward to find the closing ``` and
  // extract block content for heuristic. Lines are 1-indexed in markdownlint.
  for (const lineNo of [...lines].sort((a, b) => a - b)) {
    const idx = lineNo - 1;
    if (srcLines[idx] !== '```') continue; // already fixed or different opener

    // gather block content up to closing ```
    let blockEnd = idx + 1;
    while (blockEnd < srcLines.length && srcLines[blockEnd] !== '```') blockEnd++;
    const blockContent = srcLines.slice(idx + 1, blockEnd).join('\n');

    const lang = pickLang(blockContent);
    srcLines[idx] = '```' + lang;
    totalFixed++;
  }

  writeFileSync(path, srcLines.join('\n'));
  console.log(`  ✓ ${path} (${lines.size} fence${lines.size === 1 ? '' : 's'})`);
}

console.log(`\n✓ Fixed ${totalFixed} bare \`\`\` fences across ${byFile.size} files.`);
