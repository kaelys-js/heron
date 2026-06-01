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
// The white-silhouette variant (user-provided) arrives on the same kind of
// removable light background, so it gets the identical cutout. Used by the app
// icons (brand-mascot embeds it as iconPngWhite).
const SIL_RAW = join(ROOT, 'branding', 'mascot-silhouette.png');
const SIL_OUT = join(ROOT, 'branding', 'assets', 'mascot-silhouette.png');
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

/**
 * Extract LIGHT line-art from a flat DARK background (the white-silhouette source
 * is thin light strokes on solid dark navy). Every pixel becomes white; its
 * alpha ramps with the source LUMINANCE (`lo`→transparent, `hi`→opaque), so the
 * dark field drops out and only the light strokes (anti-aliased) survive. Pure +
 * exported. Returns a NEW RGBA buffer.
 */
export function extractLineArt(data, width, height, lo = 90, hi = 170) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const a = Math.max(0, Math.min(1, (lum - lo) / (hi - lo)));
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}

/**
 * Morphological DILATION of the alpha channel (separable max-filter, radius `r`),
 * then alpha hardening. Thickens thin line-art strokes into a confident, SOLID
 * mark -- unlike a blur, a max-dilate keeps the stroke fully opaque instead of
 * feathering it translucent. RGB is forced white. Pure + exported; returns a NEW
 * RGBA buffer of the same dimensions.
 */
export function dilateAlpha(rgba, width, height, r) {
  const n = width * height;
  const src = new Uint8Array(n);
  for (let i = 0; i < n; i++) src[i] = rgba[i * 4 + 3];
  const radius = Math.max(0, Math.round(r));
  let dil = src;
  if (radius > 0) {
    const tmp = new Uint8Array(n);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);
        let m = 0;
        for (let xx = x0; xx <= x1; xx++) {
          const v = src[row + xx];
          if (v > m) m = v;
        }
        tmp[row + x] = m;
      }
    }
    const outA = new Uint8Array(n);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(height - 1, y + radius);
        let m = 0;
        for (let yy = y0; yy <= y1; yy++) {
          const v = tmp[yy * width + x];
          if (v > m) m = v;
        }
        outA[y * width + x] = m;
      }
    }
    dil = outA;
  }
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < n; i++) {
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    // Harden: gamma-lift the mid alphas so the stroke body is crisp + opaque,
    // leaving only a 1px anti-aliased rim -- a bold white mark, not a grey wash.
    const a = dil[i] / 255;
    out[i * 4 + 3] = Math.round(Math.min(1, Math.pow(a, 0.55) * 1.18) * 255);
  }
  return out;
}

/**
 * Recenter an RGBA buffer by its ALPHA-WEIGHTED CENTROID into a `size`² canvas,
 * scaling so the content fits with `margin` headroom (e.g. 0.86 ⇒ ~7% margin per
 * side). Centering by centroid (visual mass) rather than the bounding box keeps
 * the mascot's FACE at the true center even when a decorative arc/sparkle pads
 * the bbox. Async (sharp). Returns a PNG buffer.
 */
export async function recenterByCentroid(rgba, width, height, size, margin = 0.86) {
  let minx = width,
    miny = height,
    maxx = 0,
    maxy = 0,
    sx = 0,
    sy = 0,
    n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3] / 255;
      if (a > 0.04) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
        sx += x * a;
        sy += y * a;
        n += a;
      }
    }
  }
  const cx = sx / n,
    cy = sy / n;
  const half = (size / 2) * margin;
  const scale = Math.min(1, half / Math.max(cx - minx, maxx - cx, cy - miny, maxy - cy));
  const sw = Math.round(width * scale),
    sh = Math.round(height * scale);
  const scaled = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(sw, sh)
    .png()
    .toBuffer();
  const left = Math.round(size / 2 - cx * scale);
  const top = Math.round(size / 2 - cy * scale);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Process the white-silhouette source (light line-art on a solid dark bg) into a
 * clean, centered, transparent MASTER_SIZE² master for the app icon:
 *   1. luminance-key the dark field out, keeping the light strokes as white;
 *   2. recenter by the visual-mass centroid;
 *   3. BOLDEN so it reads on the light brand gradient (not a dark bg): a wide
 *      luminance ramp grabs more of the anti-aliased stroke edge (thicker
 *      strokes), and a soft dark halo is baked in BEHIND the white strokes for
 *      contrast (the white-on-busy-background trick).
 * Returns counts for logging.
 */
export async function cleanSilhouette(rawPath, outPath) {
  const { data, info } = await sharp(rawPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Clean ramp keys the dark navy field out, keeping only the light strokes.
  const keyed = extractLineArt(data, info.width, info.height, 70, 160);
  // BOLDEN: morphological dilation thickens the thin strokes into a confident,
  // opaque white mark (radius scales with the source so it's resolution-stable).
  const radius = Math.max(2, Math.round(info.width / 200));
  const bold = dilateAlpha(keyed, info.width, info.height, radius);
  const white = await recenterByCentroid(bold, info.width, info.height, MASTER_SIZE);

  // ONE restrained soft dark shadow behind the strokes so the white reads on the
  // lighter part of the brand gradient -- a drop shadow, not a muddy aura pool.
  const { data: wd, info: wi } = await sharp(white)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const shadowPx = Buffer.alloc(wd.length);
  for (let i = 0; i < wd.length; i += 4) {
    shadowPx[i] = 12;
    shadowPx[i + 1] = 24;
    shadowPx[i + 2] = 40;
    shadowPx[i + 3] = Math.round(wd[i + 3] * 0.5);
  }
  const shadow = await sharp(shadowPx, {
    raw: { width: wi.width, height: wi.height, channels: 4 },
  })
    .blur(7)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow },
      { input: white }, // crisp, bold white mark on top
    ])
    .png()
    .toFile(outPath);
  return { w: info.width, h: info.height };
}

/**
 * Cut the COLOUR mascot art (on a removable light background) into a clean,
 * transparent MASTER_SIZE² master. (The white silhouette uses cleanSilhouette --
 * it's light line-art on a dark field, a different extraction.) `trim` (default
 * true) crops transparent margins and re-centers the bounding box. Returns
 * counts for logging.
 */
export async function cleanMaster(rawPath, outPath, { trim = true } = {}) {
  const { data, info } = await sharp(rawPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const cleared = removeWhiteBackground(data, width, height);
  const fringed = defringeLightEdges(data, width, height);

  // Keyed buffer -> PNG, optionally trimmed, then letterboxed into a square via
  // `fit: contain` (exact MASTER_SIZE² canvas, aspect preserved -- no padding math).
  let staged = sharp(data, { raw: { width, height, channels: 4 } }).png();
  if (trim) staged = staged.trim();
  const stagedBuf = await staged.toBuffer({ resolveWithObject: true });
  await sharp(stagedBuf.data)
    .resize(MASTER_SIZE, MASTER_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    // Palette-quantise: the mascot is a flat cartoon (a few dozen colours), so a
    // 256-colour indexed PNG is visually identical but ~5x smaller than the full
    // RGBA encode. Without this the 1024² master is ~950 KB; with it, ~180 KB.
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(outPath);

  return { cleared, fringed, w: stagedBuf.info.width, h: stagedBuf.info.height };
}

async function main() {
  const m = await cleanMaster(RAW, OUT);
  const s = await cleanSilhouette(SIL_RAW, SIL_OUT);

  // Emit the base64 embeds the brand surfaces inline (committed, turbo-cacheable;
  // apply-brand + splash-spec read this synchronously).
  const embeds = await encodeMascot(ROOT);
  writeFileSync(mascotB64Path(ROOT), JSON.stringify(embeds, null, 2) + '\n');

  const rel = (p) => p.replace(ROOT + '/', '');
  console.log(
    `✓ mascot master: ${rel(OUT)} (${MASTER_SIZE}² · cleared ${m.cleared} + ${m.fringed} fringe · subject ${m.w}×${m.h})\n` +
      `✓ silhouette master: ${rel(SIL_OUT)} (${MASTER_SIZE}² · line-art luminance-key + centroid recenter · source ${s.w}×${s.h})\n` +
      `✓ embeds written: ${rel(mascotB64Path(ROOT))} ` +
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
