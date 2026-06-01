#!/usr/bin/env node
// Smoke test for splash-spec.mjs -- the single-source splash builders.
//
// Hand-rolled (not vitest) so it runs in pre-commit / CI without booting the
// vitest workspace, matching the other scripts/*.test.mjs.
//
// Invariants under test:
//   - the splash mark is the BARE MASCOT (data-URI <img>), not a squircle tile
//     or a vector glyph
//   - the background is the mascot-sampled splashBg, given depth by a soft
//     vignette + a film grain (NOT the login/signup dawn-sky bloom)
//   - the still frame (animated:false) is the resting frame: SAME mark/arc/bg,
//     only the motion block differs -- native-PNG -> web-boot handoff can't drift
//   - reduced-motion always collapses to the still frame
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadBrandSource,
  buildArcSvg,
  buildSplashVisual,
  buildSplashHtml,
  MARK_CLAMP,
} from './splash-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { colors, mascot } = loadBrandSource(ROOT);
const splashBg = mascot.splashBg;
const mascotDataUri = mascot.heroWebp;

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

t('loadBrandSource yields colors + the mascot embeds (incl. splashBg)', () => {
  assert.ok(colors.primary && colors.accent && colors.accentSecondary && colors.darkBg);
  assert.ok(mascot.heroWebp?.startsWith('data:image/webp;base64,'), 'heroWebp embed present');
  assert.match(splashBg, /^#[0-9a-f]{6}$/, 'splashBg is a hex sampled from the mascot');
});

t('arc is the dawn-gold loader ring', () => {
  const arc = buildArcSvg({ colors });
  assert.ok(arc.includes(colors.accent));
  assert.ok(arc.includes('splash-arc-ring') && arc.includes('stroke-dasharray'));
});

t('the splash is the BARE mascot on the sampled bg, with vignette + grain', () => {
  const html = buildSplashHtml({ colors, splashBg, mascotDataUri, animated: true });
  assert.ok(html.includes('class="splash-mark-img"'), 'bare mascot <img> present');
  assert.ok(html.includes(mascotDataUri), 'the mascot data-URI is embedded');
  assert.ok(html.includes(`background: ${splashBg}`), 'sampled-blue base layer');
  assert.ok(html.includes('splash-vignette') && html.includes('radial-gradient'), 'vignette layer');
  assert.ok(html.includes('splash-grain') && html.includes('feTurbulence'), 'film-grain layer');
  // Bare mascot: NO squircle tile (rx) and NO login/signup dawn-sky bloom.
  assert.ok(!html.includes('rx="232"'), 'no squircle tile on the splash');
  assert.ok(!html.includes('#090b0f'), 'no dawn-sky bloom on the splash');
  assert.ok(!html.includes('<symbol') && !html.includes('pathLength'), 'no vector glyph remnants');
});

t('animated splash bounces the mascot; still frame has no motion', () => {
  const anim = buildSplashHtml({ colors, splashBg, mascotDataUri, animated: true });
  const still = buildSplashHtml({ colors, splashBg, mascotDataUri, animated: false });
  assert.ok(anim.includes('@keyframes splash-bounce'), 'animated must define the entrance bounce');
  assert.ok(
    anim.includes('@keyframes splash-rebounce'),
    'animated must define the looping re-bounce',
  );
  assert.ok(!still.includes('@keyframes'), 'still frame must define NO keyframes');
  for (const html of [anim, still]) {
    assert.ok(
      html.includes('splash-bg') && html.includes('splash-mark') && html.includes('splash-arc'),
    );
    assert.ok(html.includes(MARK_CLAMP), 'mark must use the viewport clamp');
  }
});

t('reduced-motion collapses the animated splash to the still frame', () => {
  const css = buildSplashVisual({ colors, splashBg, mascotDataUri, animated: true });
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(/prefers-reduced-motion[\s\S]*animation: none/.test(css));
});

console.log(`\nsplash-spec.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
