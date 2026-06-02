#!/usr/bin/env node
// Unit test for generate-icons.mjs's pure `scaleSvgImage` helper. Hand-rolled
// (not vitest) so it runs in pre-commit / CI without the vitest workspace,
// matching the other scripts/*.test.mjs.
//
// WHY this invariant matters: the macOS dock tile scales ONLY the heron <image>
// inside the squircle (so the bird reads larger in the Dock) while leaving the
// gradient <rect> card untouched. The scale must be CENTRE-PRESERVING -- a naive
// width/height bump without recomputing x/y would shove the bird off-centre and
// clip it against the squircle corners.
import assert from 'node:assert/strict';
import { scaleSvgImage } from './generate-icons.mjs';

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

// Mirrors the real favicon.svg inner: gradient squircle rect + centred heron.
const RECT = '<rect width="1024" height="1024" rx="232" fill="url(#g)" />';
const IMAGE =
  '<image x="172" y="172" width="680" height="680" href="data:image/png;base64,AAAA" />';
const INNER = `${RECT}${IMAGE}`;

t('scales the <image> 1.5x about its centre (680@172 -> 1020@2)', () => {
  const out = scaleSvgImage(INNER, 1.5);
  assert.match(out, /<image[^>]*\bwidth="1020"/, 'width should be 680*1.5');
  assert.match(out, /<image[^>]*\bheight="1020"/, 'height should be 680*1.5');
  // centre stays at 512,512: x = 512 - 1020/2 = 2
  assert.match(out, /<image[^>]*\bx="2"/, 'x should recenter to 2');
  assert.match(out, /<image[^>]*\by="2"/, 'y should recenter to 2');
});

t('leaves the squircle <rect> untouched', () => {
  const out = scaleSvgImage(INNER, 1.5);
  assert.ok(out.includes(RECT), 'the gradient rect must be byte-identical');
});

t('preserves the href payload', () => {
  const out = scaleSvgImage(INNER, 1.5);
  assert.match(out, /href="data:image\/png;base64,AAAA"/, 'href must survive');
});

t('handles a non-integer scale (1.25 -> 850@87)', () => {
  const out = scaleSvgImage(INNER, 1.25);
  assert.match(out, /\bwidth="850"/, '680*1.25 = 850');
  assert.match(out, /\bx="87"/, '512 - 850/2 = 87');
});

t('is a no-op fragment with no <image>', () => {
  const out = scaleSvgImage(RECT, 1.5);
  assert.equal(out, RECT, 'no <image> -> unchanged');
});

t('scale of 1 returns geometrically identical attrs', () => {
  const out = scaleSvgImage(INNER, 1);
  assert.match(out, /\bx="172"/);
  assert.match(out, /\bwidth="680"/);
});

console.log(`generate-icons.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
