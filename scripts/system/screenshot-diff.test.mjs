#!/usr/bin/env node
/**
 * Unit tests for screenshot-diff.mjs.
 *
 * Run: node scripts/system/screenshot-diff.test.mjs
 *
 * No test framework -- plain Node + assert + exit-code-on-fail, matching
 * scripts/system/verify-no-deflection.test.mjs and friends.
 */
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import {
  THRESHOLD_DEFAULTS,
  resolveThresholds,
  decide,
  diffRatio,
  classify,
} from './screenshot-diff.mjs';

let passed = 0;
let failed = 0;
function ok(name, fn) {
  try {
    fn();
    console.log(`  OK  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`    ${err.message}`);
    failed += 1;
  }
}

// ── Fixture helpers ─────────────────────────────────────────────────
// Build a PNG buffer of solid `fill`, then optionally repaint the first
// `changed` pixels with `alt`. RGBA tuples are [r,g,b,a].
const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

function makePng(width, height, fill = BLACK, changed = 0, alt = WHITE) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const px = i < changed ? alt : fill;
    const o = i * 4;
    png.data[o] = px[0];
    png.data[o + 1] = px[1];
    png.data[o + 2] = px[2];
    png.data[o + 3] = px[3];
  }
  return PNG.sync.write(png);
}

console.log('screenshot-diff.mjs -- unit tests\n');

// ── decide() boundaries ─────────────────────────────────────────────
const T = { noiseFloor: 0.001, ceiling: 0.1 };
ok('decide: 0 -> skip', () => assert.equal(decide(0, T), 'skip'));
ok('decide: just below floor -> skip', () => assert.equal(decide(0.0009, T), 'skip'));
ok('decide: exactly floor -> write', () => assert.equal(decide(0.001, T), 'write'));
ok('decide: mid-band -> write', () => assert.equal(decide(0.05, T), 'write'));
ok('decide: exactly ceiling -> write', () => assert.equal(decide(0.1, T), 'write'));
ok('decide: just above ceiling -> exceed', () => assert.equal(decide(0.1001, T), 'exceed'));
ok('decide: way above -> exceed', () => assert.equal(decide(0.9, T), 'exceed'));

// ── resolveThresholds() env parsing ─────────────────────────────────
ok('thresholds: defaults', () => {
  const r = resolveThresholds({});
  assert.equal(r.noiseFloor, THRESHOLD_DEFAULTS.noiseFloor);
  assert.equal(r.ceiling, THRESHOLD_DEFAULTS.ceiling);
});
ok('thresholds: env override', () => {
  const r = resolveThresholds({ SCREENSHOT_NOISE_FLOOR: '0.02', SCREENSHOT_DIFF_CEILING: '0.25' });
  assert.equal(r.noiseFloor, 0.02);
  assert.equal(r.ceiling, 0.25);
});
ok('thresholds: garbage env falls back to default', () => {
  const r = resolveThresholds({ SCREENSHOT_NOISE_FLOOR: 'nope', SCREENSHOT_DIFF_CEILING: '-3' });
  assert.equal(r.noiseFloor, THRESHOLD_DEFAULTS.noiseFloor);
  assert.equal(r.ceiling, THRESHOLD_DEFAULTS.ceiling);
});

// ── diffRatio() pixel math ──────────────────────────────────────────
ok('diffRatio: identical -> 0', () => {
  const a = makePng(100, 100);
  const r = diffRatio(a, makePng(100, 100));
  assert.equal(r.changedPixels, 0);
  assert.equal(r.totalPixels, 10000);
  assert.equal(r.ratio, 0);
});
ok('diffRatio: 1 of 10000 -> 0.0001', () => {
  const r = diffRatio(makePng(100, 100), makePng(100, 100, BLACK, 1, WHITE));
  assert.equal(r.changedPixels, 1);
  assert.equal(r.ratio, 0.0001);
});
ok('diffRatio: half changed -> ~0.5', () => {
  const r = diffRatio(makePng(100, 100), makePng(100, 100, BLACK, 5000, WHITE));
  assert.ok(Math.abs(r.ratio - 0.5) < 1e-9, `ratio=${r.ratio}`);
});
ok('diffRatio: dimension mismatch pads to union and counts new rows', () => {
  // 10x10 black vs 10x20 black: bottom 10 rows of B are real black, A's
  // padded rows are transparent (0,0,0,0) -> differ -> counted.
  const r = diffRatio(makePng(10, 10), makePng(10, 20));
  assert.equal(r.totalPixels, 200);
  assert.ok(r.ratio > 0 && r.ratio < 1, `ratio=${r.ratio}`);
  assert.equal(r.changedPixels, 100); // the 10x10 grown region
});

// ── classify() decision, incl. brand-new baseline ──────────────────
ok('classify: null baseline -> write + isNew', () => {
  const c = classify(null, makePng(10, 10), T);
  assert.equal(c.decision, 'write');
  assert.equal(c.isNew, true);
});
ok('classify: identical -> skip', () => {
  const c = classify(makePng(100, 100), makePng(100, 100), T);
  assert.equal(c.decision, 'skip');
});
ok('classify: ~5% change -> write', () => {
  const c = classify(makePng(100, 100), makePng(100, 100, BLACK, 500, WHITE), T);
  assert.equal(c.decision, 'write');
  assert.ok(Math.abs(c.ratio - 0.05) < 1e-9, `ratio=${c.ratio}`);
});
ok('classify: 20% change -> exceed', () => {
  const c = classify(makePng(100, 100), makePng(100, 100, BLACK, 2000, WHITE), T);
  assert.equal(c.decision, 'exceed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
