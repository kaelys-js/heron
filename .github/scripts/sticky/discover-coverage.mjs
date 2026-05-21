#!/usr/bin/env node
/**
 * discover-coverage.mjs -- auto-discover coverage reports in any format
 * + emit normalised JSON for the sticky-comment formatter.
 *
 * Auto-discovery means: drop a coverage file (lcov / cobertura / istanbul /
 * clover / xcov) anywhere in the working tree and the next CI run picks
 * it up. No `.github/coverage-sources.yml` to maintain, no per-workspace
 * registration. Add a new test suite, get coverage in the sticky for free.
 *
 * Recognised formats (probed by filename + content shape):
 *   - Istanbul / v8 coverage-summary.json  (Vitest, Jest, c8)
 *   - lcov.info                            (Vitest --coverage with lcov reporter,
 *                                          Jest, gcov, many others)
 *   - cobertura.xml                        (xcov for iOS via Fastlane slather;
 *                                          Python coverage.py; Go gocover-cobertura;
 *                                          Java JaCoCo)
 *   - clover.xml                           (PHPUnit, legacy Jest)
 *   - xcov coverage_report.json            (Fastlane xcov action default)
 *
 * Flag/suite name derives from the FIRST meaningful path segment the
 * coverage file lives under, with `coverage` / `fastlane` / `xcov` etc.
 * stripped. Examples:
 *   ui/coverage/lcov.info                       → flag `ui`
 *   ui/electron/coverage/lcov.info              → flag `ui-electron`
 *   ui/ios/App/fastlane/coverage/cobertura.xml  → flag `ios`
 *   coverage/lcov.info                          → flag `default`
 *
 * Usage:
 *   node .github/scripts/sticky/discover-coverage.mjs [--root <path>] [--out <path>]
 *
 * Default --root is process.cwd(). Default --out is stdout (the workflow
 * captures it via `> coverage.json`).
 *
 * Output schema:
 *   {
 *     "schema_version": 1,
 *     "scanned_at": "2026-05-21T17:55:00Z",
 *     "flags": [
 *       {
 *         "name": "ui",
 *         "source_file": "ui/coverage/lcov.info",
 *         "format": "lcov",
 *         "lines_pct": 84.32,
 *         "branches_pct": 71.18,
 *         "statements_pct": 84.30,
 *         "functions_pct": 88.10,
 *         "files_count": 142,
 *         "missing_lines_count": 1843,
 *         "top_uncovered_files": [
 *           { "path": "src/foo.ts", "lines_pct": 12.5, "missing": 234 },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    out: { type: 'string' },
  },
  allowPositionals: false,
});

const ROOT = path.resolve(args.root);

// Directories we never walk into -- speeds discovery + avoids spurious matches.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  '.turbo',
  'build',
  'dist',
  '_build',
  'Pods',
  'SourcePackages',
  'DerivedData',
  '.venv',
  '.gradle',
  '.next',
  '.nuxt',
  '.expo',
  '.angular',
  '.cache',
  'tmp',
]);

// Filenames that mean coverage, anywhere in the tree.
const COVERAGE_FILES = new Set([
  'coverage-summary.json',
  'lcov.info',
  'cobertura.xml',
  'clover.xml',
  'coverage_report.json',
]);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (COVERAGE_FILES.has(ent.name)) acc.push(full);
  }
  return acc;
}

/** Derive flag name from the absolute path of the coverage file.
 *
 * Rule: take the LAST meaningful path segment. Drops noise segments
 * (`coverage`, `fastlane`, `xcov`, `App`, etc.) AND parent workspace
 * names when there's a more-specific child. Result: Codecov-style
 * single-word flags (`ui`, `electron`, `ios`) so the sticky table reads
 * the way reviewers expect.
 *
 * Examples:
 *   ui/coverage/lcov.info                       -> "ui"
 *   ui/electron/coverage/lcov.info              -> "electron"
 *   ui/ios/App/fastlane/coverage/cobertura.xml  -> "ios"
 *   coverage/lcov.info                          -> "default"
 */
function flagFromPath(absPath) {
  const rel = path.relative(ROOT, absPath);
  const segs = rel.split(path.sep).slice(0, -1); // drop filename
  const NOISE = new Set([
    'coverage',
    'fastlane',
    'xcov',
    'reports',
    'test_output',
    'test',
    'output',
    'src',
    'lib',
    'App',
  ]);
  const meaningful = segs.filter((s) => !NOISE.has(s));
  if (meaningful.length === 0) return 'default';
  // Last meaningful segment wins -- gives Codecov-style flags rather
  // than path-joined chains like `ui-ios` (which read as "ui and ios"
  // rather than "the iOS app in the ui workspace").
  return meaningful[meaningful.length - 1];
}

/** Detect format by filename + a content sniff for edge cases. */
function detectFormat(absPath) {
  const base = path.basename(absPath);
  if (base === 'coverage-summary.json') return 'istanbul';
  if (base === 'coverage_report.json') return 'xcov';
  if (base === 'lcov.info') return 'lcov';
  if (base === 'cobertura.xml') return 'cobertura';
  if (base === 'clover.xml') return 'clover';
  return 'unknown';
}

// ---- Parsers ----------------------------------------------------------

function parseIstanbul(absPath) {
  const json = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const total = json.total || {};
  const fileEntries = Object.entries(json).filter(([k]) => k !== 'total');
  const topUncovered = fileEntries
    .map(([file, m]) => ({
      // Istanbul stores paths as either absolute or already-relative. Only
      // relativize when absolute; never push the file through `path.relative`
      // against an unrelated cwd because that produces nonsense `../../../`
      // chains when a relative path is treated as cwd-relative.
      path: path.isAbsolute(file) ? path.relative(ROOT, file) : file,
      lines_pct: m.lines?.pct ?? 0,
      missing: (m.lines?.total ?? 0) - (m.lines?.covered ?? 0),
    }))
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);
  return {
    lines_pct: total.lines?.pct ?? null,
    branches_pct: total.branches?.pct ?? null,
    statements_pct: total.statements?.pct ?? null,
    functions_pct: total.functions?.pct ?? null,
    files_count: fileEntries.length,
    missing_lines_count: fileEntries.reduce(
      (sum, [, m]) => sum + ((m.lines?.total ?? 0) - (m.lines?.covered ?? 0)),
      0,
    ),
    top_uncovered_files: topUncovered,
  };
}

function parseLcov(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  let totalLines = 0;
  let coveredLines = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;
  const fileStats = []; // { path, missing, lines_pct }

  let current = null;
  for (const line of src.split('\n')) {
    if (line.startsWith('SF:')) {
      current = { path: line.slice(3).trim(), lf: 0, lh: 0 };
    } else if (current && line.startsWith('LF:')) {
      current.lf = parseInt(line.slice(3), 10) || 0;
    } else if (current && line.startsWith('LH:')) {
      current.lh = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('BRF:')) {
      totalBranches += parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('BRH:')) {
      coveredBranches += parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('FNF:')) {
      totalFunctions += parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('FNH:')) {
      coveredFunctions += parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('end_of_record') && current) {
      totalLines += current.lf;
      coveredLines += current.lh;
      const missing = current.lf - current.lh;
      const lines_pct = current.lf === 0 ? 100 : (current.lh / current.lf) * 100;
      fileStats.push({
        // Same isAbsolute guard as parseIstanbul -- only relativize when
        // lcov stored an absolute path.
        path: path.isAbsolute(current.path) ? path.relative(ROOT, current.path) : current.path,
        lines_pct,
        missing,
      });
      current = null;
    }
  }

  const topUncovered = fileStats
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);

  return {
    lines_pct: totalLines === 0 ? null : (coveredLines / totalLines) * 100,
    branches_pct: totalBranches === 0 ? null : (coveredBranches / totalBranches) * 100,
    statements_pct: null, // lcov doesn't distinguish lines from statements
    functions_pct: totalFunctions === 0 ? null : (coveredFunctions / totalFunctions) * 100,
    files_count: fileStats.length,
    missing_lines_count: totalLines - coveredLines,
    top_uncovered_files: topUncovered,
  };
}

function parseCobertura(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  // Root attributes give us the rolled-up totals. Regex (not full XML parse)
  // because cobertura's root tag has the rates as attributes -- low-cost
  // extraction.
  const rootMatch = src.match(/<coverage\s+([^>]*?)>/);
  if (!rootMatch) return zeroShape();
  const attrs = rootMatch[1];
  const lineRate = parseFloat((attrs.match(/line-rate=["']([\d.]+)["']/) || [, '0'])[1]);
  const branchRate = parseFloat((attrs.match(/branch-rate=["']([\d.]+)["']/) || [, '0'])[1]);
  const linesValid = parseInt((attrs.match(/lines-valid=["'](\d+)["']/) || [, '0'])[1], 10);
  const linesCovered = parseInt((attrs.match(/lines-covered=["'](\d+)["']/) || [, '0'])[1], 10);
  // Per-file stats from <class filename="..." line-rate="..." ...>...</class>.
  // Need the FULL block (not just the open tag) so we can count inner
  // <line number="N" hits="0"/> for the missing-lines breakdown.
  // Regex with `s` flag for cross-line match against the inner body.
  const classBlockRe = /<class\s+([^>]*?)>([\s\S]*?)<\/class>/g;
  const fileStats = [];
  let m;
  while ((m = classBlockRe.exec(src))) {
    const a = m[1];
    const body = m[2];
    const fileMatch = a.match(/filename=["']([^"']+)["']/);
    const rateMatch = a.match(/line-rate=["']([\d.]+)["']/);
    if (!fileMatch) continue;
    const file = fileMatch[1];
    const rate = rateMatch ? parseFloat(rateMatch[1]) : 0;
    // Count inner `<line ... hits="0" />` entries for the per-file
    // missing-lines count. Cobertura emits one <line> per executable
    // line with a `hits` attribute (0 = uncovered).
    const lineRe = /<line\s+[^>]*?hits=["'](\d+)["']/g;
    let missing = 0;
    let lm;
    while ((lm = lineRe.exec(body))) {
      if (parseInt(lm[1], 10) === 0) missing += 1;
    }
    fileStats.push({ path: file, lines_pct: rate * 100, missing });
  }
  const topUncovered = fileStats
    .filter((r) => r.missing > 0 || r.lines_pct < 100)
    .sort((a, b) => b.missing - a.missing || a.lines_pct - b.lines_pct)
    .slice(0, 10);
  return {
    lines_pct: lineRate * 100,
    branches_pct: branchRate * 100,
    statements_pct: null,
    functions_pct: null,
    files_count: fileStats.length,
    missing_lines_count: linesValid - linesCovered,
    top_uncovered_files: topUncovered,
  };
}

function parseClover(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  // Clover root <metrics .../> attributes: statements, coveredstatements, conditionals, coveredconditionals.
  const metricsMatch = src.match(/<metrics\s+([^/]*?)\/>/);
  if (!metricsMatch) return zeroShape();
  const a = metricsMatch[1];
  const statements = parseInt((a.match(/statements=["'](\d+)["']/) || [, '0'])[1], 10);
  const coveredStatements = parseInt(
    (a.match(/coveredstatements=["'](\d+)["']/) || [, '0'])[1],
    10,
  );
  const conditionals = parseInt((a.match(/conditionals=["'](\d+)["']/) || [, '0'])[1], 10);
  const coveredConditionals = parseInt(
    (a.match(/coveredconditionals=["'](\d+)["']/) || [, '0'])[1],
    10,
  );
  return {
    lines_pct: null,
    branches_pct: conditionals === 0 ? null : (coveredConditionals / conditionals) * 100,
    statements_pct: statements === 0 ? null : (coveredStatements / statements) * 100,
    functions_pct: null,
    files_count: 0,
    missing_lines_count: statements - coveredStatements,
    top_uncovered_files: [],
  };
}

function parseXcov(absPath) {
  // Fastlane xcov produces a coverage_report.json with shape:
  //   { "targets": [ { "name": "...", "coverage": 0.83, "files": [ { "name": "...", "coverage": ... } ] } ] }
  const json = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const targets = json.targets || [];
  let totalLines = 0;
  let coveredLines = 0;
  const fileStats = [];
  for (const t of targets) {
    for (const f of t.files || []) {
      const lf = f.executable_lines ?? 0;
      const lh = f.covered_lines ?? Math.round((f.coverage ?? 0) * lf);
      totalLines += lf;
      coveredLines += lh;
      fileStats.push({
        path: f.name || f.path || '?',
        lines_pct: (f.coverage ?? 0) * 100,
        missing: lf - lh,
      });
    }
  }
  const topUncovered = fileStats
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);
  return {
    lines_pct: totalLines === 0 ? null : (coveredLines / totalLines) * 100,
    branches_pct: null,
    statements_pct: null,
    functions_pct: null,
    files_count: fileStats.length,
    missing_lines_count: totalLines - coveredLines,
    top_uncovered_files: topUncovered,
  };
}

function zeroShape() {
  return {
    lines_pct: null,
    branches_pct: null,
    statements_pct: null,
    functions_pct: null,
    files_count: 0,
    missing_lines_count: 0,
    top_uncovered_files: [],
  };
}

const PARSERS = {
  istanbul: parseIstanbul,
  lcov: parseLcov,
  cobertura: parseCobertura,
  clover: parseClover,
  xcov: parseXcov,
};

// ---- Main -------------------------------------------------------------

function main() {
  const found = walk(ROOT);
  const flagsByName = new Map();
  for (const file of found) {
    const format = detectFormat(file);
    if (format === 'unknown') continue;
    const flagName = flagFromPath(file);
    let metrics;
    try {
      metrics = PARSERS[format](file);
    } catch (err) {
      console.error(`::warning::discover-coverage failed to parse ${file}: ${err.message}`);
      continue;
    }
    // Prefer the format we encountered first per flag -- multiple formats
    // for the same suite (lcov + cobertura) would otherwise emit two
    // identical rows. Istanbul tends to be richer than lcov; lcov richer
    // than cobertura -- but we don't try to merge, just first wins.
    if (flagsByName.has(flagName)) continue;
    flagsByName.set(flagName, {
      name: flagName,
      source_file: path.relative(ROOT, file),
      format,
      ...metrics,
    });
  }

  const flags = Array.from(flagsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
  const payload = {
    schema_version: 1,
    scanned_at: new Date().toISOString(),
    flags,
  };
  const out = JSON.stringify(payload, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, out);
    console.error(`Wrote ${flags.length} flag(s) to ${args.out}`);
  } else {
    process.stdout.write(out);
    process.stdout.write('\n');
  }
}

main();
