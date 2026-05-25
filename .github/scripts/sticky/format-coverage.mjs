#!/usr/bin/env node
/**
 * format-coverage.mjs -- consumes the JSON from discover-coverage.mjs
 * + an optional baseline (latest `coverage-baseline` artifact on `main`)
 * and emits the markdown body for the `heron-pr-coverage` sticky.
 *
 * Layout (Codecov-inspired, condensed to fit a PR comment):
 *
 *   ## ✅ Coverage: 84.32% (▴ +0.18% vs base)
 *
 *   | Flag | Lines | Branches | Statements | Functions | Δ Lines |
 *   |---|---|---|---|---|---|
 *   | ui  | 84.32% ████████░░ | 71.18% ███████░░░ | 84.30% | 88.10% | ▴ +0.18% |
 *   | ios | 61.40% ██████░░░░ | --        | --     | --       | = 0.00% |
 *
 *   <details><summary>Top uncovered files</summary>
 *   | Path | Coverage | Missing |
 *   |---|--:|--:|
 *   | src/foo.ts | 12.5% | 234 lines |
 *   ...
 *   </details>
 *
 *   <footer auto-appended by the composite action>
 *
 * Usage:
 *   node .github/scripts/sticky/format-coverage.mjs <current.json> [baseline.json] [--out <path>]
 *
 * Exit 0 always; the comment itself signals the verdict via emoji header.
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import {
  EMOJI,
  statusEmoji,
  deltaCell,
  pctBar,
  collapsibleSection,
  table,
  verdictHeader,
} from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: {
    out: { type: 'string' },
    // The lines-pct floor that decides ✅ vs ❌ verdict at the top.
    // Configurable so this script can format coverage for any project
    // not just Heron. Default mirrors `ui/vitest.config.ts` (70%).
    threshold: { type: 'string', default: '70' },
  },
  allowPositionals: true,
});

const currentPath = positionals[0];
const baselinePath = positionals[1] || null;
if (!currentPath) {
  console.error('Usage: format-coverage.mjs <current.json> [baseline.json] [--out <path>]');
  process.exit(2);
}

const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const baseline =
  baselinePath && fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { flags: [] };

const threshold = parseFloat(opts.threshold);

// Find baseline flag matching a current flag by name.
function baselineFor(name) {
  return (baseline.flags || []).find((f) => f.name === name);
}

// Compute the OVERALL lines_pct across all flags as a weighted average
// (by file count). Falls back to simple average if file_counts unknown.
function overall(flags) {
  const usable = flags.filter((f) => typeof f.lines_pct === 'number');
  if (usable.length === 0) return null;
  const weighted = usable.reduce((s, f) => s + f.lines_pct * (f.files_count || 1), 0);
  const denom = usable.reduce((s, f) => s + (f.files_count || 1), 0);
  return denom === 0 ? null : weighted / denom;
}

const overallCurrent = overall(current.flags);
const overallBaseline = overall(baseline.flags || []);
const overallDelta =
  overallCurrent != null && overallBaseline != null ? overallCurrent - overallBaseline : null;

const verdict = overallCurrent != null && overallCurrent >= threshold ? 'pass' : 'fail';
const overallStr = overallCurrent != null ? `${overallCurrent.toFixed(2)}%` : '--';
const deltaStr =
  overallDelta != null ? deltaCell(overallBaseline, overallCurrent, { threshold: 0.05 }) : '';

// Headline per-flag table: line coverage + bar + delta. The secondary
// metrics (branches/statements/functions) go in a nested collapsible so
// the default view stays to 3 columns and reads on mobile.
const rows = current.flags.map((f) => {
  const b = baselineFor(f.name);
  const pct =
    typeof f.lines_pct === 'number'
      ? `${f.lines_pct.toFixed(2)}% ${pctBar(f.lines_pct, 10)}`
      : '--';
  const delta =
    b && typeof b.lines_pct === 'number' && typeof f.lines_pct === 'number'
      ? deltaCell(b.lines_pct, f.lines_pct, { threshold: 0.05 })
      : 'new';
  return {
    Flag: `\`${f.name}\``,
    Coverage: pct,
    'Δ vs main': delta,
  };
});

const pctCell = (v) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '--');
const metricRows = current.flags.map((f) => ({
  Flag: `\`${f.name}\``,
  Branches: pctCell(f.branches_pct),
  Statements: pctCell(f.statements_pct),
  Functions: pctCell(f.functions_pct),
}));

// Build top-uncovered-files collapsible (aggregated across flags).
const allUncovered = current.flags.flatMap((f) =>
  (f.top_uncovered_files || []).map((u) => ({ flag: f.name, ...u })),
);
allUncovered.sort((a, b) => b.missing - a.missing);
const topRows = allUncovered.slice(0, 15).map((u) => ({
  Flag: `\`${u.flag}\``,
  Path: `\`${u.path}\``,
  Coverage: `${u.lines_pct.toFixed(2)}%`,
  Missing: u.missing > 0 ? `${u.missing} lines` : '--',
}));

const lines = [];
lines.push(
  verdictHeader(`Coverage: ${overallStr}${deltaStr ? ` (${deltaStr} vs base)` : ''}`, verdict),
);
if (overallCurrent != null && overallCurrent < threshold) {
  lines.push('');
  lines.push(
    `> :warning: Overall coverage is below the **${threshold}%** floor configured in \`ui/vitest.config.ts\`.`,
  );
}
lines.push('');

if (rows.length === 0) {
  lines.push(
    '_No coverage reports found. Did the test suite emit any of `coverage-summary.json` / `lcov.info` / `cobertura.xml` / `coverage_report.json`?_',
  );
} else {
  lines.push(
    table([{ label: 'Flag' }, { label: 'Coverage' }, { label: 'Δ vs main', align: 'right' }], rows),
  );
  lines.push('');
  lines.push(
    collapsibleSection(
      'Branches, statements, functions',
      table(
        [
          { label: 'Flag' },
          { label: 'Branches', align: 'right' },
          { label: 'Statements', align: 'right' },
          { label: 'Functions', align: 'right' },
        ],
        metricRows,
      ),
    ),
  );
}

if (topRows.length > 0) {
  lines.push('');
  lines.push(
    collapsibleSection(
      `Top ${topRows.length} file${topRows.length === 1 ? '' : 's'} with most missing lines`,
      table(
        [
          { label: 'Flag' },
          { label: 'Path' },
          { label: 'Coverage', align: 'right' },
          { label: 'Missing', align: 'right' },
        ],
        topRows,
      ),
    ),
  );
}

lines.push('');
lines.push(
  '<sub>auto-discovered from any `coverage-summary.json` / `lcov.info` / `cobertura.xml` / `clover.xml` / `coverage_report.json` under the working tree. Add a new test suite -> coverage shows up here automatically.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
  console.error(`Wrote ${out.length} bytes to ${opts.out}`);
} else {
  process.stdout.write(out);
}
