#!/usr/bin/env node
/**
 * verify-deep-links.mjs — regression test for the careerops:// deep-link
 * parser.
 *
 * The parser lives at ui/src/lib/client/deep-links.ts and turns the
 * custom-scheme URLs that widgets / Live Activities / notifications emit
 * into SvelteKit routes. A typo'd switch arm there silently breaks every
 * tap target on iOS — the user opens a widget and lands at "/" instead
 * of "/job/abc/interview-prep". The test-all suite has no Swift-target
 * coverage, so this script is the safety net.
 *
 * Strategy:
 *   1. Run the TypeScript parser via `pnpm exec tsx` so SvelteKit's `$lib`
 *      alias resolves (the parser imports `$lib/client/brand`).
 *   2. Pipe in a tiny harness that imports `parseDeepLink` and asserts each
 *      contracted form. Output is one PASS/FAIL line per case.
 *
 * Run from the repo root:
 *   node verify-deep-links.mjs
 *
 * Exit code is 1 on any failure so CI fails the PR.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const UI = join(ROOT, 'ui');

// (input careerops:// URL, expected route or null)
//
// Keep this list short + canonical — every widget / Live Activity / notif
// surface emits one of these forms. Adding a new form means adding a row
// here AND adding it to the audit checklist for every iOS surface.
const CASES = [
  // Root + simple routes
  ['careerops://', '/'],
  ['careerops://pipeline', '/pipeline'],
  ['careerops://inbox', '/inbox'],
  ['careerops://queue', '/queue'],
  ['careerops://applied', '/applied'],
  ['careerops://settings', '/settings'],
  ['careerops://autopilot', '/autopilot'],
  ['careerops://profile', '/profile'],

  // Job page — widget tap from TopApplyWidget single/medium
  ['careerops://job/abc123', '/job/abc123'],

  // Job interview-prep — Live Activity "Open prep" + NextInterview widget
  ['careerops://interview-prep/xyz789', '/job/xyz789/interview-prep'],

  // Empty-id job link → fall through to /pipeline
  ['careerops://job/', '/pipeline'],
  ['careerops://interview-prep/', '/pipeline'],

  // Login — widget signed-out gate target
  ['careerops://login', '/login?redirectTo=/'],

  // Notifications — fires the brand event, route stays at /
  ['careerops://notifications', '/#event=career-ops:open-notifications'],

  // Unknown route — fall through to root so a typo'd link doesn't drop
  // the user nowhere.
  ['careerops://garbage', '/'],

  // Malformed URL — parser returns null
  ['not a url at all', null],
];

// The harness lives at ui/src/lib/client/__verify-deep-links.test.ts so
// the relative import path is simply './deep-links-parser.ts' — that
// file is a sibling. We import the dependency-free parser module
// (rather than ./deep-links.ts which pulls in Capacitor + SvelteKit
// `goto`, neither of which load in bare Node).
const HARNESS = `
import { parseDeepLink } from './deep-links-parser.ts';

const cases = ${JSON.stringify(CASES)};
let pass = 0;
let fail = 0;
for (const [input, expected] of cases) {
  const actual = parseDeepLink(input);
  if (actual === expected) {
    pass++;
    console.log('  ✅', JSON.stringify(input), '→', JSON.stringify(actual));
  } else {
    fail++;
    console.log('  ❌', JSON.stringify(input), '→', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  }
}
console.log('');
console.log(\`\${pass} passed, \${fail} failed\`);
process.exit(fail === 0 ? 0 : 1);
`;

console.log('🔍 verify-deep-links — careerops:// parser regression test');
console.log('');

// Place the harness alongside the implementation so tsx resolves the
// $lib alias the same way SvelteKit does. Cleanup is unconditional —
// even on test failure we don't leave a stray .test.ts in the tree.
const harnessPath = join(UI, 'src', 'lib', 'client', '__verify-deep-links.test.ts');
mkdirSync(dirname(harnessPath), { recursive: true });
writeFileSync(harnessPath, HARNESS);

let exitCode = 0;
try {
  const out = execFileSync('pnpm', ['--filter', 'ui', 'exec', 'tsx', harnessPath], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(out);
} catch (e) {
  // tsx returned non-zero — print whatever it managed to emit and bail.
  if (e && typeof e === 'object' && 'stdout' in e && e.stdout) {
    process.stdout.write(String(e.stdout));
  }
  if (e && typeof e === 'object' && 'stderr' in e && e.stderr) {
    process.stderr.write(String(e.stderr));
  }
  exitCode = 1;
} finally {
  rmSync(harnessPath, { force: true });
}

process.exit(exitCode);
