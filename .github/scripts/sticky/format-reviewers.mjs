#!/usr/bin/env node
/**
 * format-reviewers.mjs -- emits the heron-pr-reviewers sticky body.
 *
 * Reads .github/CODEOWNERS + the list of files changed in the PR,
 * matches each file to its owners, and produces a "who should review"
 * table with one final assignment recommendation.
 *
 * --lottery <N>: random-pick N reviewers from the CODEOWNERS union to
 * avoid bus-factor. When there are M owners on the union and you ask
 * for N (N < M), the sticky shows the random pick instead of the full
 * union. Deterministic seeded by the PR head SHA so re-runs on the
 * same commit pick the same reviewers.
 *
 * Usage:
 *   node format-reviewers.mjs <changed-files.txt> <CODEOWNERS-path> [--lottery N] [--seed SHA] [--out path]
 *
 *   <changed-files.txt> = one path per line (typically from
 *                         `git diff --name-only base..head`)
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: {
    out: { type: 'string' },
    lottery: { type: 'string' },
    seed: { type: 'string' },
  },
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

/** Deterministic PRNG -- seeded by the PR head SHA (or empty string)
 *  so re-running the lottery on the same commit always picks the same
 *  reviewers. Mulberry32 -- 32-bit state, good enough for sampling. */
function makeRng(seed) {
  let state = 0;
  for (const ch of seed || 'seed') {
    state = (state + ch.charCodeAt(0)) >>> 0;
    state = (state * 0x6c8e9cf5) >>> 0;
    state = (state ^ (state >>> 13)) >>> 0;
  }
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using the provided rng; returns a NEW array. */
function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ownerList = [...allOwners];
const lotterySize = opts.lottery ? Math.max(1, parseInt(opts.lottery, 10)) : null;
const useLottery = lotterySize !== null && ownerList.length > lotterySize;
const picked = useLottery
  ? shuffle(ownerList, makeRng(opts.seed || '')).slice(0, lotterySize)
  : ownerList;

const lines = [];
const total = changedFiles.length;
const orphaned = fileOwners.filter((f) => f.owners.length === 0).length;
const verdict = orphaned === 0 ? 'pass' : 'warn';
const title = useLottery
  ? `Reviewers: ${picked.length} of ${ownerList.length} owner${ownerList.length === 1 ? '' : 's'} picked by lottery (${total} changed file${total === 1 ? '' : 's'})`
  : orphaned === 0
    ? `Reviewers: ${ownerList.length} owner${ownerList.length === 1 ? '' : 's'} covers all ${total} changed file${total === 1 ? '' : 's'}`
    : `Reviewers: ${orphaned} of ${total} changed files have no CODEOWNER`;

lines.push(verdictHeader(title, verdict));
lines.push('');

if (picked.length > 0) {
  const heading = useLottery
    ? `**Suggested reviewers** (random pick of ${picked.length} from ${ownerList.length} eligible owners; seeded by commit SHA for reproducibility):`
    : '**Suggested reviewers** (union of CODEOWNERS for the changed paths):';
  lines.push(heading);
  lines.push('');
  lines.push(picked.map((o) => `- ${o}`).join('\n'));
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
