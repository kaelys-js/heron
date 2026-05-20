#!/usr/bin/env node
// TDD for verify-comment-style.mjs.
import { findHeaderBloat, findCommentSlop, HEADER_MAX_LINES } from './verify-comment-style.mjs';

const FIXTURES = [
  // ── Header bloat gate ──
  {
    name: 'header: 3-line block passes',
    fn: 'header',
    body: '/** one liner.\n *  two. */\nconst x = 1;\n',
    expect: 0,
  },
  {
    name: `header: ${HEADER_MAX_LINES + 1}-line block flagged`,
    fn: 'header',
    body:
      '/**\n' +
      '\n'.repeat(HEADER_MAX_LINES - 1) +
      ' * line ' +
      HEADER_MAX_LINES +
      '\n */\nconst x = 1;\n',
    expect: 1,
  },
  {
    name: 'header: only fires when file starts with /**',
    fn: 'header',
    body: 'const x = 1;\n/** \n\n\n\n\n\n\n\n\n\n\n\n\n */',
    expect: 0,
  },

  // ── Slop adjectives ──
  {
    name: 'slop: "comprehensive" in // comment flagged',
    fn: 'slop',
    body: '// This is a comprehensive solution\n',
    expectMatches: ['comprehensive'],
  },
  {
    name: 'slop: "robust" in JSDoc continuation flagged',
    fn: 'slop',
    body: '/**\n * Robust against connection drops.\n */\n',
    expectMatches: ['robust'],
  },
  {
    name: 'slop: "leverage" flagged (verb form)',
    fn: 'slop',
    body: '// We leverage the existing cache here\n',
    expectMatches: ['leverage'],
  },
  {
    name: 'slop: "leveraging" flagged (continuous form)',
    fn: 'slop',
    body: '// Leveraging the typed store keeps things tidy\n',
    expectMatches: ['leveraging'],
  },
  {
    name: 'slop: word inside a string literal ignored',
    fn: 'slop',
    body: 'const msg = "comprehensive coverage";\n',
    expectMatches: [],
  },
  {
    name: 'slop: word in trailing // comment flagged',
    fn: 'slop',
    body: 'const x = 1; // a powerful pattern\n',
    expectMatches: ['powerful'],
  },

  // ── Historical framing ──
  {
    name: 'framing: "Pre-fix" prose flagged',
    fn: 'slop',
    body: '// Pre-fix: this used to read from process.env\n',
    expectMatches: ['pre-fix'],
  },
  {
    name: 'framing: "post-fix" prose flagged',
    fn: 'slop',
    body: '/**\n * Post-fix behaviour: now reads per-user.\n */\n',
    expectMatches: ['post-fix'],
  },
  {
    name: 'framing: "historical context" prose flagged',
    fn: 'slop',
    body: '// historical context: pre-2026 install used .env\n',
    expectMatches: ['historical context'],
  },

  // ── Negative cases ──
  {
    name: 'clean comment passes',
    fn: 'slop',
    body: '// Reads the active profile and writes to disk.\n',
    expectMatches: [],
  },
];

let failed = 0;
console.log('verify-comment-style.mjs -- unit tests');
console.log('');

for (const f of FIXTURES) {
  let issues;
  if (f.fn === 'header') {
    issues = findHeaderBloat(f.body);
  } else {
    issues = findCommentSlop(f.body);
  }

  let ok = true;
  if (f.expect !== undefined) {
    ok = issues.length === f.expect;
    const icon = ok ? 'OK' : 'FAIL';
    console.log(`  ${icon}  [header] ${f.name}  (got ${issues.length}, want ${f.expect})`);
  } else {
    const matches = issues.map((i) => i.match).sort();
    const want = [...f.expectMatches].sort();
    ok = matches.length === want.length && matches.every((m, i) => m === want[i]);
    const icon = ok ? 'OK' : 'FAIL';
    console.log(
      `  ${icon}  [slop] ${f.name}  (got [${matches.join(',')}], want [${want.join(',')}])`,
    );
  }
  if (!ok) failed++;
}

console.log('');
if (failed > 0) {
  console.error(`FAIL ${failed}/${FIXTURES.length} test(s)`);
  process.exit(1);
}
console.log(`OK ${FIXTURES.length}/${FIXTURES.length} test(s) passed`);
