#!/usr/bin/env node
// TDD suite for verify-modes.mjs::findModeIssues.

import { findModeIssues, KNOWN_TOKENS } from './verify-modes.mjs';

const FIXTURES = [
  // ── Header gate ──
  {
    name: 'header: well-formed `# Mode: foo -- subtitle` passes',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- subtitle line\n\nbody\n',
    expectKinds: [],
  },
  {
    name: 'header: missing # Mode: prefix flagged',
    rel: 'modes/foo.md',
    body: '# Foo -- something\n\nbody\n',
    expectKinds: ['header'],
  },
  {
    name: 'header: slug must match filename',
    rel: 'modes/foo.md',
    body: '# Mode: bar -- subtitle\n\nbody\n',
    expectKinds: ['header'],
  },
  {
    name: 'header: _shared.md exempt from schema',
    rel: 'modes/_shared.md',
    body: '# Heron shared utilities\n\nbody\n',
    expectKinds: [],
  },

  // ── Unknown-token gate ──
  {
    name: 'unknown-token: __CV___ typo (triple trailing underscore)',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRead `__CV___` for stuff.\n',
    expectKinds: ['unknown-token'],
  },
  {
    name: 'unknown-token: known tokens pass',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRead `__CV__` and `__PROFILE_YML__`.\n',
    expectKinds: [],
  },
  {
    name: 'unknown-token: _TOKENS.md examples allowed',
    rel: 'modes/_TOKENS.md',
    body: '# Tokens\n\nExample: __FOO__ and __BOGUS__ are unknown.\n',
    expectKinds: [],
  },

  // ── Literal-path gate ──
  {
    name: 'literal: bare `cv.md` flagged',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRead cv.md for content.\n',
    expectKinds: ['literal-path'],
  },
  {
    name: 'literal: `config/profile.yml` flagged',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRead `config/profile.yml` for content.\n',
    expectKinds: ['literal-path'],
  },
  {
    name: 'literal: `batch/batch-state.tsv` flagged',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nState in batch/batch-state.tsv.\n',
    expectKinds: ['literal-path'],
  },
  {
    name: 'literal: code-fenced block leaves literals alone',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\n```bash\nnode generate-pdf.mjs cv.md\n```\n',
    expectKinds: [],
  },

  // ── Bare-script gate ──
  {
    name: 'bare-script: `node cv-sync-check.mjs` flagged',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRun `node cv-sync-check.mjs` first.\n',
    expectKinds: ['bare-script'],
  },
  {
    name: 'bare-script: full path passes',
    rel: 'modes/foo.md',
    body: '# Mode: foo -- bar\n\nRun `node scripts/quality/cv-sync-check.mjs`.\n',
    expectKinds: [],
  },

  // ── Spot-check: known-good fixture ──
  {
    name: 'comprehensive valid mode passes',
    rel: 'modes/foo.md',
    body:
      '# Mode: foo -- the full thing\n\n' +
      'Read `__CV__`, `__PROFILE_YML__`, and `__PROFILE_MD__`.\n' +
      'Write reports to `__REPORTS__/{n}.md` and state to `__BATCH__/batch-state.tsv`.\n' +
      'Run `node scripts/cv/generate-pdf.mjs`.\n',
    expectKinds: [],
  },
];

let failed = 0;
console.log('verify-modes.mjs -- unit tests');
console.log('');

for (const f of FIXTURES) {
  const issues = findModeIssues(f.rel, f.body);
  const gotKinds = issues.map((i) => i.kind).sort();
  const wantKinds = [...f.expectKinds].sort();
  const ok = gotKinds.length === wantKinds.length && gotKinds.every((k, i) => k === wantKinds[i]);
  const icon = ok ? 'OK' : 'FAIL';
  console.log(`  ${icon}  ${f.name}  (got [${gotKinds.join(',')}], want [${wantKinds.join(',')}])`);
  if (!ok) {
    failed++;
    if (issues.length)
      console.log(
        `      details:`,
        issues.map((i) => `${i.kind} L${i.line}: ${i.text.slice(0, 40)}`),
      );
  }
}

console.log('');
if (failed > 0) {
  console.error(`FAIL ${failed}/${FIXTURES.length} test(s)`);
  process.exit(1);
}
console.log(`OK ${FIXTURES.length}/${FIXTURES.length} test(s) passed`);
