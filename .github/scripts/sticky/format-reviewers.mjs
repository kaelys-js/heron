#!/usr/bin/env node
/**
 * format-reviewers.mjs -- emits the heron-pr-reviewers sticky body.
 *
 * v1: reads .github/CODEOWNERS and the list of files changed in the PR,
 * matches each file to its owners, and produces a "who should review"
 * table with one final assignment recommendation.
 *
 * Reviewer-lottery extension (later): random-pick from CODEOWNERS to
 * avoid bus factor when multiple owners match.
 *
 * Usage:
 *   node format-reviewers.mjs <changed-files.txt> <CODEOWNERS-path> [--out path]
 *
 *   <changed-files.txt> = one path per line (typically from
 *                         `git diff --name-only base..head`)
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const filesPath = positionals[0];
const codeownersPath = positionals[1] || '.github/CODEOWNERS';
if (!filesPath) {
  console.error('Usage: format-reviewers.mjs <changed-files.txt> [<CODEOWNERS-path>] [--out path]');
  process.exit(2);
}

if (!fs.existsSync(filesPath)) {
  console.error(`Changed-files list not found at: ${filesPath}`);
  process.exit(2);
}

const changedFiles = fs
  .readFileSync(filesPath, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

// Parse CODEOWNERS: each line is `<pattern> <owner1> <owner2> ...`.
// Comments + blank lines ignored. Last matching pattern wins per file
// (CODEOWNERS semantics).
const codeowners = fs.existsSync(codeownersPath)
  ? fs
      .readFileSync(codeownersPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const [pattern, ...owners] = l.split(/\s+/);
        return { pattern, owners };
      })
  : [];

function globToRegex(glob) {
  // Minimal CODEOWNERS pattern translation:
  //   ** -> any number of segments
  //   * -> any single-segment character run
  //   leading /  -> anchored at repo root
  //   trailing / -> directory + everything under it
  let pat = glob;
  const anchored = pat.startsWith('/');
  if (anchored) pat = pat.slice(1);
  const dirOnly = pat.endsWith('/');
  if (dirOnly) pat = pat.slice(0, -1);
  pat = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(
    anchored ? `^${pat}${dirOnly ? '(/.*)?' : ''}$` : `(^|/)${pat}${dirOnly ? '(/.*)?' : ''}$`,
  );
}

function ownersFor(file) {
  // Last match wins (CODEOWNERS semantics).
  for (let i = codeowners.length - 1; i >= 0; i--) {
    const { pattern, owners } = codeowners[i];
    const re = globToRegex(pattern);
    if (re.test(file)) return owners;
  }
  return [];
}

const fileOwners = changedFiles.map((f) => ({ file: f, owners: ownersFor(f) }));
const allOwners = new Set();
for (const f of fileOwners) {
  for (const o of f.owners) allOwners.add(o);
}

const lines = [];
const total = changedFiles.length;
const orphaned = fileOwners.filter((f) => f.owners.length === 0).length;
const verdict = orphaned === 0 ? 'pass' : 'warn';
const title =
  orphaned === 0
    ? `Reviewers: ${allOwners.size} owner${allOwners.size === 1 ? '' : 's'} covers all ${total} changed file${total === 1 ? '' : 's'}`
    : `Reviewers: ${orphaned} of ${total} changed files have no CODEOWNER`;

lines.push(verdictHeader(title, verdict));
lines.push('');

if (allOwners.size > 0) {
  lines.push('**Suggested reviewers** (union of CODEOWNERS for the changed paths):');
  lines.push('');
  lines.push([...allOwners].map((o) => `- ${o}`).join('\n'));
  lines.push('');
}

if (orphaned > 0) {
  lines.push('**Files without a CODEOWNER** -- consider adding an entry to `.github/CODEOWNERS`:');
  lines.push('');
  lines.push(
    table(
      [{ label: 'Path' }],
      fileOwners
        .filter((f) => f.owners.length === 0)
        .slice(0, 30)
        .map((f) => ({ Path: `\`${f.file}\`` })),
    ),
  );
  lines.push('');
}

lines.push(
  '<sub>CODEOWNERS-based suggestion. The maintainer makes the final assignment; this comment is advisory.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
