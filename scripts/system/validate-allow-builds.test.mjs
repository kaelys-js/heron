#!/usr/bin/env node
// Smoke test for validate-allow-builds.mjs -- the catch-at-push guard that
// replicates pnpm's ERR_PNPM_IGNORED_BUILDS check locally. Hand-rolled (not
// vitest) so it runs without the vitest workspace, matching the other
// scripts/*.test.mjs. The invariant under test: a non-boolean allowBuilds value
// (the placeholder that shipped to CI) AND an unclassified build-script package
// must each be a hard error -- exactly what a fresh `pnpm install` would reject.
import assert from 'node:assert/strict';
import { checkAllowBuilds, parseAllowBuilds } from './validate-allow-builds.mjs';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

t('parseAllowBuilds keeps a non-boolean placeholder visible (string value)', () => {
  const ab = parseAllowBuilds(
    ['allowBuilds:', "  '@tsparticles/engine': set this to true or false", '  esbuild: true'].join(
      '\n',
    ),
  );
  assert.equal(typeof ab['@tsparticles/engine'], 'string'); // NOT silently dropped
  assert.equal(ab.esbuild, true);
});

t('placeholder (non-boolean value) is a hard error -- THE CI install failure', () => {
  const { errors } = checkAllowBuilds({
    allowBuilds: { '@tsparticles/engine': 'set this to true or false' },
    buildScriptPkgs: new Set(['@tsparticles/engine']),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be true or false/);
});

t('a build-script package missing from allowBuilds is a hard error', () => {
  const { errors } = checkAllowBuilds({
    allowBuilds: { esbuild: true },
    buildScriptPkgs: new Set(['esbuild', 'sharp']), // sharp unclassified
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sharp ships an install script but is not in allowBuilds/);
});

t('both false and true are valid classifications (no error)', () => {
  const { errors } = checkAllowBuilds({
    allowBuilds: { esbuild: true, msw: false },
    buildScriptPkgs: new Set(['esbuild', 'msw']),
  });
  assert.equal(errors.length, 0);
});

t('a stale entry (no installed package needs it) is a WARNING, not an error', () => {
  const { errors, warnings } = checkAllowBuilds({
    allowBuilds: { esbuild: true, 'gone-pkg': false },
    buildScriptPkgs: new Set(['esbuild']),
  });
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /gone-pkg.*stale/);
});

t('a fully-classified map with no extras passes clean', () => {
  const { errors, warnings } = checkAllowBuilds({
    allowBuilds: { esbuild: true, sharp: true, msw: false },
    buildScriptPkgs: new Set(['esbuild', 'sharp', 'msw']),
  });
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

console.log(`validate-allow-builds: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
