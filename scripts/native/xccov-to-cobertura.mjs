#!/usr/bin/env node
/**
 * xccov-to-cobertura.mjs -- convert an Xcode .xcresult's coverage into a
 * Cobertura XML, the format check-ios-coverage.mjs gates on and Codecov
 * ingests.
 *
 * Replaces the per-scheme `slather` call in Fastfile::test_ci. slather
 * 2.8.5 reads the binary's coverage MAPPING from DerivedData but cannot
 * find the per-line EXECUTION data when `run_tests` writes the result
 * bundle to a custom output_directory -- it emits cobertura with
 * lines-valid populated but lines-covered=0, so every target reads 0%
 * and the gate fails even though `xcrun xccov view --report` on the same
 * xcresult shows the real coverage (App.app = 72.9%, etc.). xccov is the
 * authoritative source, so we read it directly.
 *
 * Usage:
 *   node xccov-to-cobertura.mjs \
 *     --xcresult <path/to/X.xcresult> \
 *     --source-match <substring that file paths must contain, e.g. /Extensions/AppWidget/> \
 *     --output <path/to/cobertura.xml>
 *
 * For logic-test bundles the same source file appears under both the
 * `.appex` target (not executed -> 0%) and the test `.bundle` target
 * (executed). We dedupe by path keeping the COVERED copy, so the report
 * reflects the code the tests actually ran.
 *
 * COMMON_IGNORE mirrors the Fastfile/check-ios-coverage carve-outs:
 * generated brand stubs, runtime-only ErrorReporter, and *Smoke.swift
 * scaffolds never count toward coverage.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const IGNORE = [/\/Brand\.swift$/, /\/ErrorReporter\.swift$/, /Smoke\.swift$/];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    out[key] = argv[i + 1];
  }
  return out;
}

function xccovReport(xcresult) {
  const raw = execFileSync('xcrun', ['xccov', 'view', '--report', '--json', xcresult], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

// Repo-relative path (strip the runner/local prefix) so Codecov maps the
// file to the source tree. Falls back to the basename-bearing tail.
function repoRelative(absPath) {
  const m = absPath.match(/(ui\/ios\/App\/.*)$/);
  return m ? m[1] : absPath.replace(/^.*\//, '');
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { xcresult, output } = args;
  const sourceMatch = args['source-match'];
  if (!xcresult || !sourceMatch || !output) {
    console.error('usage: --xcresult <path> --source-match <substr> --output <path>');
    process.exit(2);
  }

  const report = xccovReport(xcresult);

  // Collect every file under the source dir across ALL targets, keeping the
  // copy with the most covered lines (the executed one for logic bundles).
  const byPath = new Map();
  for (const target of report.targets ?? []) {
    for (const f of target.files ?? []) {
      if (!f.path.includes(sourceMatch)) continue;
      if (IGNORE.some((rx) => rx.test(f.path))) continue;
      const prev = byPath.get(f.path);
      if (!prev || f.coveredLines > prev.coveredLines) byPath.set(f.path, f);
    }
  }

  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  let covered = 0;
  let valid = 0;
  for (const f of files) {
    covered += f.coveredLines;
    valid += f.executableLines;
  }
  const lineRate = valid ? covered / valid : 1;

  // Cobertura body. check-ios-coverage.mjs reads the root `line-rate` and
  // each `<class filename line-rate>`; Codecov also reads the per-line
  // hits, which we synthesize from coveredLines/executableLines (file %
  // is exact; line positions are approximate since xccov --report does
  // not expose per-line hit maps).
  const classes = files
    .map((f) => {
      const rate = f.executableLines ? f.coveredLines / f.executableLines : 1;
      const rel = xmlEscape(repoRelative(f.path));
      const name = xmlEscape(f.path.replace(/^.*\//, '').replace(/\.swift$/, ''));
      let lines = '';
      for (let i = 1; i <= f.executableLines; i += 1) {
        lines += `<line number="${i}" hits="${i <= f.coveredLines ? 1 : 0}"/>`;
      }
      return `      <class name="${name}" filename="${rel}" line-rate="${rate.toFixed(4)}" branch-rate="0.0" complexity="0.0"><methods/><lines>${lines}</lines></class>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="${lineRate.toFixed(4)}" branch-rate="0.0" lines-covered="${covered}" lines-valid="${valid}" branches-covered="0" branches-valid="0" complexity="0.0" timestamp="${Math.floor(Date.now() / 1000)}" version="xccov-to-cobertura">
  <sources><source>.</source></sources>
  <packages>
    <package name="${xmlEscape(sourceMatch)}" line-rate="${lineRate.toFixed(4)}" branch-rate="0.0" complexity="0.0">
      <classes>
${classes}
      </classes>
    </package>
  </packages>
</coverage>
`;

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, xml);
  console.log(
    `xccov-to-cobertura: ${output} -- ${(lineRate * 100).toFixed(1)}% (${covered}/${valid}) over ${files.length} file(s)`,
  );
}

main();
