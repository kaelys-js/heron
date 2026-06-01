#!/usr/bin/env node
// Test for app-css-block.mjs. Hand-rolled (not vitest) to run in pre-commit /
// CI without the vitest workspace -- matches the sibling scripts/native tests.
//
// Invariant: the brand-token block emitter must collapse ANY number of existing
// blocks (including the old em-dash-marked hand-edited copy that the original
// regex could not see) down to exactly ONE fresh block. Regression guard for
// the app.css duplication that let a frozen hand-edit mask brand.json.
import assert from 'node:assert/strict';
import {
  BRAND_TOKEN_MARKER_START,
  BRAND_TOKEN_MARKER_END,
  replaceBrandTokenBlocks,
} from './app-css-block.mjs';

const ANCHOR = '@custom-variant dark (&:is(.dark *));';
const countEnd = (s) => s.split(BRAND_TOKEN_MARKER_END).length - 1;
const countStart = (s) => s.split(BRAND_TOKEN_MARKER_START).length - 1;
const EMDASH_HEADER =
  '/* AUTO-GENERATED:brand-tokens — Do not edit. Edit branding/brand.json + run `pnpm brand:apply`. */';

async function run() {
  let pass = 0;
  let fail = 0;
  const t = (name, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      fail++;
      console.error(`FAIL: ${name}\n  ${e.message}`);
    }
  };

  t('collapses TWO divergent blocks (-- + em-dash) into one fresh block', () => {
    const css = [
      '@import "tailwindcss";',
      ANCHOR,
      BRAND_TOKEN_MARKER_START,
      ':root { --muted-foreground: #6b7585; }', // stale generated value
      BRAND_TOKEN_MARKER_END,
      '',
      EMDASH_HEADER,
      ':root { --muted-foreground: #525c6c; }', // frozen hand-edit (was winning)
      BRAND_TOKEN_MARKER_END,
      '',
      '@layer base { body { color: var(--foreground); } }',
    ].join('\n');
    const out = replaceBrandTokenBlocks(css, ':root { --muted-foreground: #525c6c; }');
    assert.equal(countEnd(out), 1, 'exactly one end marker');
    assert.equal(countStart(out), 1, 'exactly one canonical start marker');
    assert.ok(!out.includes('— Do not edit'), 'em-dash header removed');
    assert.ok(!out.includes('#6b7585'), 'stale generated value removed');
    assert.ok(out.includes('#525c6c'), 'fresh block content present');
    assert.ok(out.includes(ANCHOR), 'anchor preserved');
    assert.ok(out.includes('@layer base'), 'non-block CSS preserved');
    assert.ok(
      out.indexOf(ANCHOR) < out.indexOf(BRAND_TOKEN_MARKER_START),
      'fresh block after anchor',
    );
  });

  t('inserts one block after the anchor when none exists yet', () => {
    const css = `@import "tailwindcss";\n${ANCHOR}\n@layer base {}`;
    const out = replaceBrandTokenBlocks(css, ':root { --x: 1; }');
    assert.equal(countEnd(out), 1);
    assert.ok(out.includes('--x: 1;'));
  });

  t('is idempotent -- re-running on its own output keeps exactly one block', () => {
    const css = `${ANCHOR}\n${BRAND_TOKEN_MARKER_START}\n:root { --x: 0; }\n${BRAND_TOKEN_MARKER_END}\n`;
    const once = replaceBrandTokenBlocks(css, ':root { --x: 1; }');
    const twice = replaceBrandTokenBlocks(once, ':root { --x: 1; }');
    assert.equal(countEnd(twice), 1);
    assert.equal(twice, once, 'second run is a no-op');
  });

  t('returns null when the anchor is missing (caller warns, leaves file untouched)', () => {
    assert.equal(replaceBrandTokenBlocks('body {}', ':root {}'), null);
  });

  console.log(`\napp-css-block.test: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
