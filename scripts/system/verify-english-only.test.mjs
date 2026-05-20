#!/usr/bin/env node
/**
 * Smoke test for verify-english-only.mjs::findOffenders.
 *
 * Hand-rolled (not vitest) so it runs in pre-commit without booting the
 * Vitest workspace. Two cases per detection layer:
 *   - positive (should flag)
 *   - negative (should NOT flag)
 *
 * Exit 0 = all pass. Exit 1 = any failure.
 */
import { findOffenders } from './verify-english-only.mjs';

const FIXTURES = [
  // ── Layer 1: accented characters ──
  {
    name: 'flags raw Spanish line with accents',
    text: 'Por qué no funciona esta función?',
    expectOffenders: 1,
    expectReason: 'accented',
  },
  {
    name: 'allows English loan word "cliché"',
    text: '// Avoid clichés in the cover letter',
    expectOffenders: 0,
  },
  {
    name: "allows quoted 'Clichés' in code",
    text: "if (clicheHits.length === 0) pass('Clichés', 'none');",
    expectOffenders: 0,
  },
  {
    name: 'allows English résumé spelling',
    text: 'Generate the résumé from cv.md',
    expectOffenders: 0,
  },
  {
    name: 'allows proper noun Bogotá',
    text: "{ value: 'America/Bogota', label: 'Bogotá · COT' }",
    expectOffenders: 0,
  },
  {
    name: 'flags accented Spanish that is NOT in allowlist',
    text: 'El usuario debería leer la documentación primero.',
    expectOffenders: 1,
    expectReason: 'accented',
  },

  // ── Layer 2: Spanish word cluster (no accents) ──
  {
    name: 'flags 3+ unambiguous Spanish words without accents',
    text: 'aunque nosotros tenemos que hablar sobre esto, mientras tanto',
    expectOffenders: 1,
    expectReason: 'spanish-cluster',
  },
  {
    name: 'allows English line with single Spanish-looking word',
    text: 'The portal returns a JSON response with the job listing',
    expectOffenders: 0,
  },
  {
    name: 'allows English line that happens to contain "hacer" as a string',
    text: "const action = 'hacer'; // legacy alias",
    expectOffenders: 0,
  },
  {
    name: 'flags Spanish phrase "sin embargo" in cluster (no accents)',
    text: 'Sin embargo, nosotros podemos hacer esto sin acentos',
    expectOffenders: 1,
    expectReason: 'spanish-cluster',
  },
  {
    name: 'flags Spanish-only function words densely',
    text: 'porque siempre hay que hacer algo, aunque sea poco',
    expectOffenders: 1,
    expectReason: 'spanish-cluster',
  },

  // ── Multi-line: only the offending line flagged ──
  {
    name: 'multi-line input flags only the Spanish line',
    text: 'This is English.\naunque tampoco hablamos español aquí.\nMore English.',
    expectOffenders: 1,
    expectReason: 'accented', // aquí has an accent; caught at layer 1
  },
];

let failed = 0;
console.log('verify-english-only.mjs — unit tests');
console.log('');

for (const f of FIXTURES) {
  const offenders = findOffenders(f.text);
  const countMatch = offenders.length === f.expectOffenders;
  const reasonMatch =
    f.expectReason === undefined || (offenders[0]?.reason ?? null) === f.expectReason;
  const ok = countMatch && reasonMatch;
  const icon = ok ? '✓' : '✗';
  console.log(
    `  ${icon} ${f.name}  (${offenders.length} offender${offenders.length === 1 ? '' : 's'}${
      offenders[0]?.reason ? `, reason=${offenders[0].reason}` : ''
    })`,
  );
  if (!ok) {
    failed++;
    console.log(`      expected ${f.expectOffenders} offenders, reason=${f.expectReason}`);
    console.log(
      `      got:`,
      offenders.map((o) => `${o.reason}: ${o.text.slice(0, 50)}`),
    );
  }
}

console.log('');
if (failed > 0) {
  console.error(`FAIL ${failed}/${FIXTURES.length} test(s)`);
  process.exit(1);
}
console.log(`OK ${FIXTURES.length}/${FIXTURES.length} test(s) passed`);
