#!/usr/bin/env node
// Smoke test for verify-no-slop.mjs scanner functions.
//
// The verifier has 4 scanners (md / ts-like / hash / yaml). This test
// imports each one and walks small fixture strings through them,
// asserting expected offender counts.
//
// Hand-rolled (not vitest) so it runs in pre-commit without booting
// the vitest workspace.
import {
  findOffendersMd,
  findOffendersTs,
  findOffendersHash,
  findOffendersYaml,
} from './verify-no-slop.mjs';

const EM = '—'; // U+2014
const EN = '–'; // U+2013

const FIXTURES = [
  // ── Markdown ──
  {
    name: 'md: flags em-dash in prose',
    fn: 'md',
    text: `This is ${EM} prose with an em-dash.`,
    expect: 1,
  },
  {
    name: 'md: allows em-dash inside fenced code block',
    fn: 'md',
    text: '```\nfoo --bar ' + EM + '\n```',
    expect: 0,
  },
  {
    name: 'md: flags em-dash AFTER closing fence',
    fn: 'md',
    text: '```\nfoo --bar\n```\nAfter fence ' + EM + ' prose',
    expect: 1,
  },

  // ── TS-like ──
  {
    name: 'ts: flags em-dash in // comment',
    fn: 'ts',
    text: `// This is a comment with ${EM} an em-dash`,
    expect: 1,
  },
  {
    name: 'ts: flags em-dash in JSDoc continuation',
    fn: 'ts',
    text: '/**\n * Spec line with ' + EM + ' an em-dash\n */',
    expect: 1,
  },
  {
    name: 'ts: allows em-dash inside string literal',
    fn: 'ts',
    text: "const msg = 'toast " + EM + " body';",
    expect: 0,
  },
  {
    name: 'ts: flags em-dash in trailing // comment',
    fn: 'ts',
    text: 'const x = 1; // note ' + EM + ' suffix',
    expect: 1,
  },
  {
    name: 'ts: allows em-dash in URL (https://)',
    fn: 'ts',
    text: "const u = 'https://example.com'; // " + EM + ' comment',
    expect: 1, // the // comment still has em-dash; URL is unrelated
  },
  {
    name: 'ts: ignores https:// preceding char-class trap',
    fn: 'ts',
    text: "const u = 'https://example.com'; const v = 2;",
    expect: 0,
  },

  // ── Hash (py/rb/sh) ──
  {
    name: 'py: flags em-dash in # comment',
    fn: 'hash',
    text: '# This comment has ' + EM + ' em-dash',
    expect: 1,
  },
  {
    name: 'py: flags em-dash in trailing # comment',
    fn: 'hash',
    text: 'x = 1  # trailing ' + EM + ' note',
    expect: 1,
  },
  {
    name: 'py: allows em-dash in string literal',
    fn: 'hash',
    text: 'x = "literal ' + EM + ' string"',
    expect: 0,
  },

  // ── YAML ──
  {
    name: 'yml: flags em-dash in whole-line # comment',
    fn: 'yml',
    text: '# config note with ' + EM + ' em-dash',
    expect: 1,
  },
  {
    name: 'yml: allows em-dash in string value',
    fn: 'yml',
    text: 'description: "long string with ' + EM + ' em-dash"',
    expect: 0,
  },
  {
    name: 'yml: en-dash flagged in comment',
    fn: 'yml',
    text: '# date range 2020' + EN + '2025',
    expect: 1,
  },
];

const SCANNERS = {
  md: findOffendersMd,
  ts: findOffendersTs,
  hash: findOffendersHash,
  yml: findOffendersYaml,
};

let failed = 0;
console.log('verify-no-slop.mjs -- unit tests');
console.log('');

for (const f of FIXTURES) {
  const fn = SCANNERS[f.fn];
  const offenders = fn(f.text);
  const ok = offenders.length === f.expect;
  const icon = ok ? 'OK' : 'FAIL';
  console.log(`  ${icon}  [${f.fn}] ${f.name}  (got ${offenders.length}, expect ${f.expect})`);
  if (!ok) failed++;
}

console.log('');
if (failed > 0) {
  console.error(`FAIL ${failed}/${FIXTURES.length} test(s)`);
  process.exit(1);
}
console.log(`OK ${FIXTURES.length}/${FIXTURES.length} test(s) passed`);
