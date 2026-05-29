#!/usr/bin/env node
// Smoke test for process-mascot.mjs's pure background-removal functions.
// Hand-rolled (not vitest) so it runs in pre-commit / CI without the vitest
// workspace, matching the other scripts/*.test.mjs.
//
// WHY these invariants matter: a naive "white -> transparent" would erase the
// mascot's white eye highlights. The border flood-fill must clear ONLY the
// background reachable from the edge and PRESERVE whites walled off by the dark
// outline. The de-fringe must shave pale edge pixels without eating the outline.
import assert from 'node:assert/strict';
import { removeWhiteBackground, defringeLightEdges } from './process-mascot.mjs';

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

// Build a 10×10 RGBA scene: white field, a hollow dark box (perimeter of
// x,y in [3..6]), and an enclosed white "eye" at the box interior (x,y in [4..5]).
function scene() {
  const W = 10;
  const H = 10;
  const data = new Uint8Array(W * H * 4);
  const set = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, 255, 255, 255); // white field
  for (let d = 3; d <= 6; d++) {
    set(d, 3, 40, 40, 40);
    set(d, 6, 40, 40, 40);
    set(3, d, 40, 40, 40);
    set(6, d, 40, 40, 40);
  }
  // interior (4..5) stays white -> the "eye" enclosed by the dark box
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  return { data, W, H, A };
}

t('border flood-fill clears the background white', () => {
  const { data, W, H, A } = scene();
  removeWhiteBackground(data, W, H);
  assert.equal(A(0, 0), 0, 'corner background must be transparent');
  assert.equal(A(1, 8), 0, 'edge-connected background must be transparent');
});

t('enclosed eye-white is PRESERVED (the whole point)', () => {
  const { data, W, H, A } = scene();
  removeWhiteBackground(data, W, H);
  assert.equal(A(4, 4), 255, 'white walled off by the dark outline must survive');
  assert.equal(A(5, 5), 255, 'enclosed white must survive');
});

t('the dark outline itself is never cleared', () => {
  const { data, W, H, A } = scene();
  removeWhiteBackground(data, W, H);
  assert.equal(A(3, 3), 255, 'dark outline pixel stays opaque');
});

t('de-fringe shaves a pale edge pixel but keeps a dark edge pixel', () => {
  // 3×1 strip: [transparent][light gray][dark]. Light borders transparent -> cleared;
  // dark borders the (now-cleared) light, not the original transparent, so it survives
  // this single pass.
  const W = 3;
  const H = 1;
  const data = new Uint8Array(W * H * 4);
  data.set([0, 0, 0, 0], 0); // transparent
  data.set([210, 210, 210, 255], 4); // light gray, opaque, borders transparent
  data.set([40, 40, 40, 255], 8); // dark, opaque
  const cleared = defringeLightEdges(data, W, H);
  assert.equal(cleared, 1, 'exactly the light edge pixel is cleared');
  assert.equal(data[7], 0, 'light fringe pixel -> transparent');
  assert.equal(data[11], 255, 'dark pixel preserved');
});

console.log(`\nprocess-mascot.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
