#!/usr/bin/env node
/**
 * process-mascot.mjs -- turn the raw generated mascot into the clean brand master.
 *
 * Input:  branding/mascot.png   (raw, generated; opaque white background, slack)
 * Output: branding/assets/mascot.png   (transparent, trimmed, square, 1024²)
 *
 * The raw art is a friendly cartoon heron head on a solid white field. We remove
 * the background with a BORDER flood-fill (not a global "white -> transparent"):
 * starting from the image edge, every near-white pixel reachable WITHOUT crossing
 * the mascot's dark outline becomes transparent. Enclosed whites (the eye
 * highlights) are walled off by that outline, so they survive -- a global
 * threshold would erase them. A 1px light-edge erode then shaves the
 * anti-aliased halo the white field leaves against the outline.
 *
 * Pure JS (sharp for I/O only) so it needs no ImageMagick and runs the same in
 * CI. The cleaned master is committed; re-run only when branding/mascot.png
 * changes. Everything else (logo.svg, icons, splash, Swift assets) derives from
 * the master via apply-brand + generate-icons.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { encodeMascot, mascotB64Path } from './brand-mascot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
// sharp is a transitive dep under ui/; resolve from there.
const sharp = require(join(ROOT, 'ui', 'node_modules', 'sharp'));

const RAW = join(ROOT, 'branding', 'mascot.png');
const OUT = join(ROOT, 'branding', 'assets', 'mascot.png');
const MASTER_SIZE = 1024;

/**
 * Remove the border-connected near-white background IN PLACE (sets alpha 0).
 * Enclosed near-white regions (eye highlights) are preserved because the flood
 * cannot cross the mascot's darker outline. Pure + exported for unit testing.
 *
 * @param data   RGBA byte buffer (mutated)
 * @param width  px
 * @param height px
 * @param whiteMin  a pixel counts as "background white" when r,g,b are all >= this
 * @returns number of pixels cleared
 */
export function removeWhiteBackground(data, width, height, whiteMin = 205) {
  const isWhite = (p) => {
    const i = p * 4;
    return data[i] >= whiteMin && data[i + 1] >= whiteMin && data[i + 2] >= whiteMin;
  };
  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) {
    stack.push(x, x + (height - 1) * width);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, width - 1 + y * width);
  }
  let cleared = 0;
  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    if (!isWhite(p)) continue;
    data[p * 4 + 3] = 0;
    cleared++;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }
  return cleared;
}

/**
 * One-pixel erode of LIGHT edges: any still-opaque pixel that borders a
 * transparent pixel AND is light (min channel > 150) is cleared. This removes
 * the pale anti-aliased fringe the white field leaves while keeping the dark
 * outline intact (its min channel is well below 150). Pure + exported.
 */
export function defringeLightEdges(data, width, height, lightMin = 150) {
  const transparent = (p) => data[p * 4 + 3] === 0;
  const toClear = [];
  for (let p = 0; p < width * height; p++) {
    if (transparent(p)) continue;
    const i = p * 4;
    const isLight = Math.min(data[i], data[i + 1], data[i + 2]) > lightMin;
    if (!isLight) continue;
    const x = p % width;
    const y = (p - x) / width;
    const nbrTransparent =
      (x > 0 && transparent(p - 1)) ||
      (x < width - 1 && transparent(p + 1)) ||
      (y > 0 && transparent(p - width)) ||
      (y < height - 1 && transparent(p + width));
    if (nbrTransparent) toClear.push(p);
  }
  for (const p of toClear) data[p * 4 + 3] = 0;
  return toClear.length;
}

async function main() {
  const { data, info } = await sharp(RAW).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const cleared = removeWhiteBackground(data, width, height);
  const fringed = defringeLightEdges(data, width, height);

  // Write the keyed buffer back, trim transparent margins, then letterbox into a
  // square via `fit: contain` (guarantees an exact MASTER_SIZE² canvas with the
  // mascot centered and aspect preserved -- no manual padding math).
  const trimmed = await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .trim()
    .toBuffer({ resolveWithObject: true });
  await sharp(trimmed.data)
    .resize(MASTER_SIZE, MASTER_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(OUT);

  // Emit the base64 embeds the brand surfaces inline (committed, turbo-cacheable;
  // apply-brand + splash-spec read this synchronously).
  const embeds = await encodeMascot(ROOT);
  writeFileSync(mascotB64Path(ROOT), JSON.stringify(embeds, null, 2) + '\n');

  console.log(
    `✓ mascot master written: ${OUT.replace(ROOT + '/', '')} ` +
      `(${MASTER_SIZE}² · cleared ${cleared} bg px + ${fringed} fringe px · subject ${trimmed.info.width}×${trimmed.info.height})\n` +
      `✓ embeds written: ${mascotB64Path(ROOT).replace(ROOT + '/', '')} ` +
      `(${Object.entries(embeds)
        .map(([k, v]) => `${k} ${Math.round(v.length / 1024)}KB`)
        .join(', ')})`,
  );
}

// Only run when invoked directly (the pure functions above are imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error('process-mascot failed:', e.message);
    process.exit(1);
  });
}
