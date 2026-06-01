#!/usr/bin/env node
// Smoke test for brand-mascot.mjs. Hand-rolled (not vitest) to run in
// pre-commit / CI without the vitest workspace.
//
// Invariant: every surface embed is a valid data-URI of the expected MIME, and
// the committed JSON round-trips the same keys the encoder produces -- so a
// stale mascot-b64.json (master changed, embeds not regenerated) is catchable.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeMascot, readMascotB64, sampleSplashBg, MASCOT_EMBEDS } from './brand-mascot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function run() {
  let pass = 0;
  let fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      pass++;
    } catch (e) {
      fail++;
      console.error(`FAIL: ${name}\n  ${e.message}`);
    }
  };

  const keys = Object.keys(MASCOT_EMBEDS);
  // encodeMascot also emits the app-icon silhouette (iconPngWhite, a PNG data
  // URI from the cut-out branding/assets/mascot-silhouette.png) and the sampled
  // splashBg hex, on top of the MASCOT_EMBEDS keys.
  const extraKeys = ['iconPngWhite', 'splashBg'];

  await t('encodeMascot yields a valid data-URI per embed + a splashBg hex', async () => {
    const embeds = await encodeMascot(ROOT);
    assert.deepEqual(Object.keys(embeds).sort(), [...keys, ...extraKeys].sort());
    assert.ok(
      embeds.iconPngWhite.startsWith('data:image/png;base64,'),
      'iconPngWhite should be a PNG data URI',
    );
    for (const [key, { format }] of Object.entries(MASCOT_EMBEDS)) {
      assert.ok(
        embeds[key].startsWith(`data:image/${format};base64,`),
        `${key} should be a data:image/${format} URI`,
      );
      assert.ok(embeds[key].length > 1000, `${key} should carry real image bytes`);
    }
    assert.match(embeds.splashBg, /^#[0-9a-f]{6}$/, 'splashBg should be a #rrggbb hex');
  });

  await t('sampleSplashBg returns a dark bluish hex from the mascot', async () => {
    const bg = await sampleSplashBg(ROOT);
    assert.match(bg, /^#[0-9a-f]{6}$/);
    const b = parseInt(bg.slice(5, 7), 16);
    const r = parseInt(bg.slice(1, 3), 16);
    assert.ok(b >= r, 'sampled bg should be bluish (blue >= red)');
  });

  await t('committed mascot-b64.json round-trips the encoder keys + splashBg', async () => {
    const onDisk = readMascotB64(ROOT);
    assert.deepEqual(Object.keys(onDisk).sort(), [...keys, ...extraKeys].sort());
    for (const k of [...keys, 'iconPngWhite']) assert.ok(onDisk[k].startsWith('data:image/'));
    assert.match(onDisk.splashBg, /^#[0-9a-f]{6}$/);
  });

  console.log(`\nbrand-mascot.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
