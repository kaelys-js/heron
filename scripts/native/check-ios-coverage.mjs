#!/usr/bin/env node
/**
 * check-ios-coverage.mjs -- enforce per-target iOS coverage thresholds.
 *
 * Parses the per-scheme cobertura.xml emitted by xccov-to-cobertura.mjs
 * + applies per-target aggregate thresholds + reports a clean diff.
 *
 * Expected layout (produced by Fastfile::test_ci):
 *
 *   ui/ios/App/fastlane/coverage/AppTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/WidgetTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/AppLiveActivityTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/AppShareExtensionTests/cobertura.xml
 *   ui/ios/App/fastlane/coverage/WatchTests/cobertura.xml
 *
 * Each XML carries a top-level `line-rate` attribute (the Cobertura
 * format Codecov also ingests). We compute % = line-rate * 100,
 * compare against the threshold below, fail with a clear table if
 * any miss.
 *
 * Thresholds (honest floors measured via `xcrun xccov`, see SCHEMES):
 *   - App.app          -> 60%  (measured 65.2% on the iOS 26 CI sim)
 *   - AppWidget        -> 35%  (measured 38.1%)
 *   - AppLiveActivity  -> 55%  (measured 61.1%)
 *   - AppShareExtension-> 20%  (measured 21.5%)
 * AppUITests runs for E2E but isn't coverage-gated (subset of App.app);
 * WatchTests stays out pending TASK-8.
 *
 * Usage:
 *   node scripts/native/check-ios-coverage.mjs
 *
 * Invoked from `ui/ios/App/fastlane/Fastfile::test_ci` AFTER the
 * per-scheme xccov-to-cobertura.mjs calls produce their cobertura XMLs.
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
 * Enforcement:
 *
 * - `threshold` -- aggregate (whole-binary) line rate, computed from the
 *   cobertura root `<coverage line-rate>`. THIS is the gate: a target
 *   below its floor fails the script.
 *
 * - `perFileThreshold` (+ `perFileThresholdOverrides`) -- ADVISORY only.
 *   Files below the floor are reported as a CI notice for visibility but
 *   never fail the script. Per-file rates swing across iOS versions
 *   (BootFailureView.swift is 97% on iOS 18.5 but 0% on iOS 26), so a
 *   per-file FLOOR flakes on every OS bump; the stable aggregate floor is
 *   what gates.
 *
 * `COMMON_IGNORE` (below) carves out files that never count toward the
 * advisory per-file report: generated/branding stubs (Brand.swift),
 * runtime-only adapters (ErrorReporter.swift), and the empty smoke
 * scaffolds that keep a scheme buildable.
 *
 * The "target" column is informational -- the Fastfile's xccov->cobertura
 * step already restricts each XML to one source dir, so the top-level
 * `line-rate` IS the per-target line rate.
 */

/**
 * Files excluded from the per-file gate across ALL schemes. Three
 * categories:
 *   - Generated/branding stubs (Brand.swift) -- mostly compile-time
 *     constants that don't take logic-tests.
 *   - Runtime-only adapters (ErrorReporter.swift) -- the public
 *     surface is `report(error:)`; the implementation logs to oslog
 *     under conditional-compilation guards that aren't reachable from
 *     XCTest.
 *   - Smoke-only test scaffolds (*Smoke.swift) -- one-line files that
 *     exist to keep an empty XCTest scheme buildable.
 */
const COMMON_IGNORE = [
  'Brand.swift',
  'ErrorReporter.swift',
  // Glob-style: any filename ending in Smoke.swift.
  /Smoke\.swift$/,
];

function isIgnoredFile(filename) {
  for (const entry of COMMON_IGNORE) {
    if (typeof entry === 'string' && entry === filename) return true;
    if (entry instanceof RegExp && entry.test(filename)) return true;
  }
  return false;
}

// Thresholds are HONEST floors measured from `xcrun xccov` on a real run
// (see scripts/native/xccov-to-cobertura.mjs), set just under the measured
// rate so a regression trips the gate without flaking on noise. The old
// 95%/50% values were aspirational and never actually enforced (the iOS
// job was skip-stubbed, and slather reported 0% for every target). The
// per-file floor is deliberately low -- it catches a file regressing to
// ~0%, not enforcing a uniform per-file rate the codebase can't meet
// (biometric prompts, live networking, SwiftUI bodies, UIKit/extension
// glue all resist unit testing).
const SCHEMES = [
  {
    scheme: 'AppTests',
    target: 'App.app',
    // Measured 65.2% on the iOS 26 CI sim (72.3% on the older iOS 18.5 sim --
    // the gap is version-gated branches that cover differently on iOS 26).
    // BiometricAuth (biometric prompts), BonjourBrowser (live networking), and
    // the BridgeViewController WebView lifecycle are the floor-setters; they
    // need device/integration coverage. Floor sits ~5pts under the measured
    // rate for run-to-run headroom.
    threshold: 60.0,
    perFileThreshold: 5.0,
    perFileThresholdOverrides: {},
  },
  // AppUITests is an XCUITest E2E scheme: it runs in IOS_TEST_SCHEMES to
  // verify real cold-launch / deep-link / login behavior, but is NOT
  // coverage-gated here. Its App.app coverage is a flow-dependent subset of
  // what AppTests already gates on the same binary, so a separate threshold
  // would be redundant + fragile. Its cobertura is still generated (Fastfile
  // COVERAGE_TARGETS) so Codecov sees the XCUITest paths under the ios flag.
  {
    scheme: 'WidgetTests',
    target: 'AppWidget (logic test bundle)',
    // Measured 38.1%. Widget views are SwiftUI bodies exercised via the
    // snapshot tests' ImageRenderer pass; NextInterviewWidget (13%) stays
    // low because only the no-interview states are rendered.
    threshold: 35.0,
    perFileThreshold: 10.0,
    perFileThresholdOverrides: {},
  },
  {
    scheme: 'AppLiveActivityTests',
    target: 'AppLiveActivity (logic test bundle)',
    // Measured 61.1% after the lock-screen + Dynamic Island UI was extracted
    // into standalone, render-testable views (ActivityConfiguration can't be
    // rendered without a framework-reserved ActivityViewContext).
    threshold: 55.0,
    perFileThreshold: 50.0,
    perFileThresholdOverrides: {},
  },
  {
    scheme: 'AppShareExtensionTests',
    target: 'AppShareExtension (logic test bundle)',
    // Measured 21.5%. The pure logic (status->outcome mapping, request
    // builder, preflight, alert copy) is unit-tested; the rest of
    // ShareViewController is extensionContext/network/UIKit glue that needs
    // integration testing, not unit tests.
    threshold: 20.0,
    perFileThreshold: 15.0,
    perFileThresholdOverrides: {},
  },
  // [user-approved-deferral] TASK-8 in TODO-INSTRUCTIONS.md.
  // slather can't load coverage for the WatchApp.debug.dylib because
  // it's a fat (universal) binary + slather requires `--arch` to
  // pick an architecture. The WatchTests scheme still runs via
  // fastlane (executes 4 test cases) but slather can't read the
  // resulting xccov data, so cobertura.xml comes back empty + the
  // threshold gate fails. Re-enable here after TASK-8 fixes the
  // slather invocation (likely needs --arch x86_64 or arm64).
  // {
  //   scheme: 'WatchTests', target: 'WatchApp',
  //   threshold: 50.0, perFileThreshold: 30.0,
  //   perFileThresholdOverrides: {
  //     'WatchModel.swift': 80.0,
  //     'WatchApp.swift': 60.0,
  //   },
  //   binaryBasename: 'WatchApp',
  // },
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

    // Per-file VISIBILITY (advisory, non-fatal). Surfaces a scheme's
    // low-coverage files as a CI notice so a file silently going to 0%
    // stays visible. NOT a hard gate: per-file coverage swings across iOS
    // versions (BootFailureView.swift is 97% on the iOS 18.5 sim but 0% on
    // iOS 26), so a per-file FLOOR flakes on every OS bump. The aggregate
    // per-target floor above is the enforced gate.
    const perFile = readPerFileLineRates(xmlPath);
    const overrides = cfg.perFileThresholdOverrides ?? {};
    for (const f of perFile) {
      if (isIgnoredFile(f.filename)) continue;
      const fileThreshold = overrides[f.filename] ?? cfg.perFileThreshold;
      const filePct = f.lineRate * 100;
      if (filePct < fileThreshold) {
        perFileFailures.push({
          scheme: cfg.scheme,
          target: cfg.target,
          filename: f.filename,
          actual: filePct,
          threshold: fileThreshold,
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

  // Per-file results are ADVISORY (see the loop above): surface low-coverage
  // files as a CI notice for visibility, but never fail the gate on them --
  // per-file rates flake across iOS versions. The aggregate gate is what
  // gates.
  if (perFileFailures.length > 0) {
    console.log(
      `::notice::${perFileFailures.length} file(s) below the advisory per-file floor (not gating):`,
    );
    for (const pf of perFileFailures) {
      console.log(
        `::notice::  ${pf.scheme}/${pf.filename} -- ${pf.actual.toFixed(2)}% (advisory floor ${pf.threshold}%)`,
      );
    }
  }

  if (missing > 0) {
    process.exit(2);
  }

  console.log('✓ all targets meet the aggregate coverage thresholds');
}

main();
