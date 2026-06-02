#!/usr/bin/env node
/**
 * merge-coverage.mjs -- merge the per-shard v8 coverage maps produced by
 * the sharded vitest CI matrix into the single `coverage-summary.json`
 * that scripts/system/assert-coverage-thresholds.mjs reads.
 *
 * Why this exists: the TS CI job runs vitest in parallel shards
 * (test:cov:server, test:cov:rest), each emitting an istanbul-format
 * `coverage-final.json` (v8 provider, `json` reporter). The gate job
 * downloads every shard artifact into ui/coverage/<group>/ (per-shard
 * subdir -- two shards both name their file coverage-final.json, so a
 * flat download would collide). This script globs every
 * ui/coverage/**\/coverage-final.json, merges them with
 * istanbul-lib-coverage (per-file hit counts SUM across shards), then
 * writes ui/coverage/coverage-summary.json via the istanbul json-summary
 * reporter -- the exact file + shape the threshold assertion consumes --
 * AND ui/coverage/lcov.info via the lcovonly reporter, which the gate
 * asserts on + uploads to Codecov (ts flag) + the sticky-comment artifact.
 *
 * The local full run (`pnpm test:coverage`) already produces
 * coverage-summary.json directly from one vitest invocation, so it never
 * calls this script. This is CI-shard glue only.
 *
 * Usage (from ui/): node scripts/merge-coverage.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { error, notice } from '../../scripts/lib/logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// ui/scripts/ -> ui/coverage/
const COVERAGE_DIR = resolve(__dirname, '..', 'coverage');

/**
 * Recursively collect every `coverage-final.json` under a directory.
 * Shards land in per-group subdirs (ui/coverage/server/, .../rest/), so a
 * shallow read misses them; walk the tree. Skips the istanbul HTML report
 * tree (lcov-report/, src/) which never contains a coverage-final.json.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function findCoverageFinals(dir) {
  const found = [];
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      found.push(...findCoverageFinals(full));
    } else if (entry === 'coverage-final.json') {
      found.push(full);
    }
  }
  return found;
}

const finals = findCoverageFinals(COVERAGE_DIR);
if (finals.length === 0) {
  error(`no coverage-final.json found under ${COVERAGE_DIR}`);
  error('Did the sharded vitest jobs upload ts-cov-* artifacts into ui/coverage/<group>/?');
  process.exit(2);
}

const map = libCoverage.createCoverageMap({});
for (const file of finals) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    error(`failed to parse ${file}: ${err.message}`);
    process.exit(2);
  }
  // istanbul-lib-coverage merge sums per-file/per-statement/per-branch hit
  // counts across maps, so a line covered in EITHER shard counts as covered
  // in the union -- the correct semantics for "did the whole suite cover X".
  map.merge(libCoverage.createCoverageMap(parsed));
}

// Render the reporters against the merged map. createContext + each
// reporter's execute() write into COVERAGE_DIR, matching what
// `pnpm test:coverage` emits from a single vitest run:
//   json-summary -> coverage-summary.json (assert-coverage-thresholds reads it)
//   lcovonly     -> lcov.info (the gate asserts it + uploads to Codecov)
const context = libReport.createContext({
  dir: COVERAGE_DIR,
  coverageMap: map,
});
reports.create('json-summary').execute(context);
// lcovonly emits a bare lcov.info (no HTML tree), keyed to COVERAGE_DIR.
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);

const summaryPath = join(COVERAGE_DIR, 'coverage-summary.json');
if (!existsSync(summaryPath)) {
  error(`json-summary reporter did not write ${summaryPath}`);
  process.exit(2);
}

const lcovPath = join(COVERAGE_DIR, 'lcov.info');
if (!existsSync(lcovPath)) {
  error(`lcovonly reporter did not write ${lcovPath}`);
  process.exit(2);
}

notice(
  `merged ${finals.length} coverage shard(s) -> ${summaryPath} + ${lcovPath} ` +
    `(${map.files().length} files)`,
);
