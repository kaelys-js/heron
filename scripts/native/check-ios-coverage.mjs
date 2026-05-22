#!/usr/bin/env node
/**
 * check-ios-coverage.mjs -- enforce per-target iOS coverage thresholds.
 *
 * Replaces the xcov gem (1.9.0, unmaintained -- can't read xcresult
 * bundles from non-default paths). Parses slather's cobertura output
 * per scheme + applies per-target thresholds + reports a clean diff.
 *
 * Expected layout (produced by Fastfile::test_ci):
 *
 *   ui/ios/App/fastlane/coverage/AppTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/WidgetTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/AppLiveActivityTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/AppShareExtensionTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/WatchTests/cobertura.xml
 *
 * Each XML carries a top-level `line-rate` attribute (slather emits
 * the same format Codecov ingests). We compute % = line-rate * 100,
 * compare against the threshold below, fail with a clear table if
 * any miss.
 *
 * User-approved thresholds:
 *   - App.app          -> 95%  (host app; 1.4k LOC of tests)
 *   - AppWidget        -> 50%  (SwiftUI body branches need WidgetKit
 *                              runtime to cover; not unit-testable)
 *   - AppLiveActivity  -> 50%  (same -- ActivityKit body branches)
 *   - AppShareExtension-> 50%  (SLComposeServiceViewController needs
 *                              extensionContext to fully cover)
 *   - WatchApp         -> 50%  (RootView SwiftUI body)
 *
 * Usage:
 *   node scripts/native/check-ios-coverage.mjs
 *
 * Invoked from `ui/ios/App/fastlane/Fastfile::test_ci` AFTER the
 * per-scheme slather calls produce their cobertura XMLs.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const COVERAGE_ROOT = resolve(REPO_ROOT, 'ui/ios/App/fastlane/coverage');

/**
 * Per-scheme cobertura.xml + the thresholds its coverage must clear.
 *
 * Two layers of enforcement:
 *
 * 1. `threshold` -- aggregate (whole-binary) line rate. Computed from
 *    the cobertura root `<coverage line-rate>` attribute.
 *
 * 2. `perFileThreshold` -- per-file line rate. Computed from each
 *    `<class filename="..." line-rate="...">` element. A single .swift
 *    file falling below the per-file floor fails the script even when
 *    the aggregate clears the bar. Without this, a heavily-tested
 *    Brand.swift + Bonjour.swift can mask a 0% NativePlugin.swift.
 *
 * The "target" column is informational -- slather's binary-basename
 * filter (configured in the Fastfile) already restricts each XML to
 * one binary's coverage, so the top-level `line-rate` IS the
 * per-target line rate.
 *
 * Per-file floors are deliberately LOWER than aggregate floors:
 * extensions ship a 30%/file floor because some single-purpose files
 * (e.g. WatchSessionBridge in the WatchApp binary) only have ~12 lines
 * of meaningful logic, and a 50%/file gate is impossible to clear
 * without test-doubling every line. The App.app target gets a stricter
 * 80%/file because its files are larger + more frequently exercised.
 */
const SCHEMES = [
  {
    scheme: 'AppTests',
    target: 'App.app',
    threshold: 95.0,
    perFileThreshold: 80.0,
    binaryBasename: 'App',
  },
  {
    scheme: 'WidgetTests',
    target: 'AppWidget (logic test bundle)',
    threshold: 50.0,
    perFileThreshold: 30.0,
    binaryBasename: 'WidgetTests',
  },
  {
    scheme: 'AppLiveActivityTests',
    target: 'AppLiveActivity (logic test bundle)',
    threshold: 50.0,
    perFileThreshold: 30.0,
    binaryBasename: 'AppLiveActivityTests',
  },
  {
    scheme: 'AppShareExtensionTests',
    target: 'AppShareExtension (logic test bundle)',
    threshold: 50.0,
    perFileThreshold: 30.0,
    binaryBasename: 'AppShareExtensionTests',
  },
  {
    scheme: 'WatchTests',
    target: 'WatchApp',
    threshold: 50.0,
    perFileThreshold: 30.0,
    binaryBasename: 'WatchApp',
  },
];

/**
 * Pull the top-level `line-rate` attribute out of a slather-emitted
 * cobertura XML. Cobertura puts it on the root `<coverage>` element:
 *   <coverage line-rate="0.6614" branch-rate="..." version="...">
 * No XML parser dep needed -- a regex on the root element is exact
 * (slather doesn't nest <coverage> tags).
 */
function readLineRate(xmlPath) {
  if (!existsSync(xmlPath)) return null;
  const content = readFileSync(xmlPath, 'utf8');
  const match = content.match(/<coverage[^>]*\bline-rate="([0-9.]+)"/);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Pull per-file line rates out of cobertura XML.
 *
 * Cobertura emits one `<class filename="..." line-rate="..." ...>` per
 * source file. The filename is RELATIVE to the source-root attribute on
 * the root `<sources>` element; we just keep the filename as-is for
 * reporting (the user reads "NativePlugin.swift" easier than
 * "App/NativePlugin.swift").
 *
 * Returns an array of { filename, lineRate } objects. Empty array when
 * the XML is missing or has no <class> elements.
 */
function readPerFileLineRates(xmlPath) {
  if (!existsSync(xmlPath)) return [];
  const content = readFileSync(xmlPath, 'utf8');
  const classMatches = [
    ...content.matchAll(/<class\s+[^>]*\bfilename="([^"]+)"[^>]*\bline-rate="([0-9.]+)"/g),
  ];
  return classMatches.map((m) => ({
    filename: m[1].replace(/^.*\//, ''), // basename only for readability
    lineRate: Number(m[2]),
  }));
}

/**
 * Format a percentage with one decimal place + a fixed width so the
 * report table aligns.
 */
function pct(n) {
  return `${(n * 100).toFixed(1).padStart(5)}%`;
}

function main() {
  console.log('▸ iOS coverage check');
  console.log(`  reading: ${COVERAGE_ROOT.replace(REPO_ROOT + '/', '')}`);
  console.log('');

  const rows = [];
  const failures = [];
  const perFileFailures = [];
  let missing = 0;

  for (const cfg of SCHEMES) {
    const xmlPath = resolve(COVERAGE_ROOT, cfg.scheme, 'cobertura.xml');
    const lineRate = readLineRate(xmlPath);

    if (lineRate === null) {
      rows.push({
        scheme: cfg.scheme,
        target: cfg.target,
        actual: '   --',
        threshold: pct(cfg.threshold / 100),
        status: '⚠ missing',
      });
      missing++;
      continue;
    }

    const actualPct = lineRate * 100;
    const ok = actualPct >= cfg.threshold;
    rows.push({
      scheme: cfg.scheme,
      target: cfg.target,
      actual: pct(lineRate),
      threshold: pct(cfg.threshold / 100),
      status: ok ? '✓ pass' : '✗ FAIL',
    });
    if (!ok) {
      failures.push({
        ...cfg,
        actual: actualPct,
      });
    }

    // Per-file enforcement. A scheme can clear the aggregate gate but
    // still hide a single .swift file at 0%; catch that here.
    const perFile = readPerFileLineRates(xmlPath);
    for (const f of perFile) {
      const filePct = f.lineRate * 100;
      if (filePct < cfg.perFileThreshold) {
        perFileFailures.push({
          scheme: cfg.scheme,
          target: cfg.target,
          filename: f.filename,
          actual: filePct,
          threshold: cfg.perFileThreshold,
        });
      }
    }
  }

  // Pretty-print the table.
  const w = {
    scheme: Math.max(6, ...rows.map((r) => r.scheme.length)),
    target: Math.max(6, ...rows.map((r) => r.target.length)),
    actual: 7,
    threshold: 9,
    status: 10,
  };
  const sep = '-'.repeat(w.scheme + w.target + w.actual + w.threshold + w.status + 12);
  const hdr = (n) =>
    `| ${'scheme'.padEnd(w.scheme)} | ${'target'.padEnd(w.target)} | ${'actual'.padStart(w.actual)} | ${'threshold'.padStart(w.threshold)} | ${'status'.padEnd(w.status)} |`;
  console.log(sep);
  console.log(hdr());
  console.log(sep);
  for (const r of rows) {
    console.log(
      `| ${r.scheme.padEnd(w.scheme)} | ${r.target.padEnd(w.target)} | ${r.actual.padStart(w.actual)} | ${r.threshold.padStart(w.threshold)} | ${r.status.padEnd(w.status)} |`,
    );
  }
  console.log(sep);
  console.log('');

  if (missing > 0) {
    console.error(`::error::${missing} cobertura.xml file(s) missing.`);
    console.error('Verify the slather + fastlane test_ci pipeline ran every scheme.');
  }

  if (failures.length > 0) {
    console.error(`::error::${failures.length} target(s) below threshold:`);
    for (const f of failures) {
      console.error(
        `::error::  ${f.target} -- actual ${f.actual.toFixed(2)}% vs threshold ${f.threshold}%`,
      );
    }
    process.exit(1);
  }

  // Per-file gate runs AFTER the aggregate check. Aggregate pass +
  // per-file fail still fails the script -- the per-file gate is
  // strictly additive, never overridden by an aggregate pass.
  if (perFileFailures.length > 0) {
    console.error('');
    console.error(`::error::${perFileFailures.length} file(s) below per-file threshold:`);
    for (const pf of perFileFailures) {
      console.error(
        `::error::  ${pf.scheme}/${pf.filename} -- actual ${pf.actual.toFixed(2)}% vs per-file threshold ${pf.threshold}%`,
      );
    }
    process.exit(1);
  }

  if (missing > 0) {
    process.exit(2);
  }

  console.log('✓ all targets meet coverage thresholds (aggregate + per-file)');
}

main();
