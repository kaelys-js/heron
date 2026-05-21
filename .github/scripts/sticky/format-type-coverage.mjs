#!/usr/bin/env node
/**
 * format-type-coverage.mjs -- emits the heron-pr-type-coverage sticky.
 *
 * Reads the output of `type-coverage --detail --json` (npm package
 * `type-coverage`):
 *   { "percentage": 99.50, "fileCounts": [["src/foo.ts", 100], ...], "totalCount": 12345, "correctCount": 12283, "anys": [...] }
 *
 * Usage:
 *   node format-type-coverage.mjs <current.json> [baseline.json] [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { deltaCell, collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' }, threshold: { type: 'string', default: '99' } },
  allowPositionals: true,
});

function load(p) {
  if (!p || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const current = load(positionals[0]);
const baseline = load(positionals[1]);
const threshold = parseFloat(opts.threshold);

if (!positionals[0]) {
  console.error('Usage: format-type-coverage.mjs <current.json> [baseline.json]');
  process.exit(2);
}

// If the current file is missing (e.g. type-coverage couldn't run), emit
// a graceful "no data" sticky rather than crashing.
if (!current || typeof current.percentage !== 'number') {
  const lines = [
    verdictHeader('Type coverage: no data', 'skip'),
    '',
    `_Couldn't read \`${positionals[0]}\`. Did the \`type-coverage\` step fail or skip?_`,
    '',
    '<sub>type-coverage --detail JSON file expected.</sub>',
  ];
  const out = lines.join('\n') + '\n';
  if (opts.out) fs.writeFileSync(opts.out, out);
  else process.stdout.write(out);
  process.exit(0);
}

const pct = current.percentage;
const deltaStr = baseline
  ? deltaCell(baseline.percentage, pct, { threshold: 0.01, decimals: 2 })
  : '🆕';
const anyCount = current.totalCount - current.correctCount;
const baseAny = baseline ? baseline.totalCount - baseline.correctCount : null;
const anyDelta =
  baseAny != null
    ? `(${deltaCell(baseAny, anyCount, { threshold: 1, suffix: ' anys', decimals: 0 })})`
    : '';

const verdict = pct >= threshold ? 'pass' : 'fail';
const title = `Type coverage: ${pct.toFixed(2)}% ${deltaStr} -- ${anyCount} \`any\`s ${anyDelta}`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (pct < threshold) {
  lines.push(`> :warning: Type coverage is below the **${threshold}%** target.`);
  lines.push('');
}

// Show files with the most `any`s (top 10).
const fileCounts = current.fileCounts || [];
// fileCounts entries are [path, correctCount, totalCount] -- top-most untyped files.
const tops = fileCounts
  .map(([p, correct, total]) => ({
    path: p,
    anys: (total || 0) - (correct || 0),
    total: total || 0,
  }))
  .filter((f) => f.anys > 0)
  .sort((a, b) => b.anys - a.anys)
  .slice(0, 10);

if (tops.length > 0) {
  lines.push(
    collapsibleSection(
      `Top ${tops.length} files with most \`any\`s`,
      table(
        [{ label: 'Path' }, { label: 'Anys', align: 'right' }, { label: 'Total', align: 'right' }],
        tops.map((f) => ({ Path: `\`${f.path}\``, Anys: String(f.anys), Total: String(f.total) })),
      ),
    ),
  );
  lines.push('');
}

lines.push(
  '<sub>type-coverage --detail. The `any` count is `totalCount - correctCount`. Lower is better.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
