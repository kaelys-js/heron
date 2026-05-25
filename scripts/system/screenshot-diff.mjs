/** Pixel-diff + threshold logic for the README screenshot pipeline.
 *
 *  Pure-JS (pixelmatch + pngjs) so it runs under Node 26 without a native
 *  build step -- sharp is intentionally absent from the install. Used by
 *  scripts/system/capture-screenshots.mjs to decide, per image, whether a
 *  freshly-rendered PNG is:
 *    • below the noise floor  -> 'skip'   (don't rewrite -> no spurious PR)
 *    • a meaningful change    -> 'write'  (rewrite -> open/refresh the PR)
 *    • above the ceiling      -> 'exceed' (rewrite, but fail for a human)
 *
 *  Thresholds are ratios of changed pixels over total (union) pixels.
 */
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const THRESHOLD_DEFAULTS = { noiseFloor: 0.001, ceiling: 0.1 };

/** Read SCREENSHOT_NOISE_FLOOR / SCREENSHOT_DIFF_CEILING, falling back to
 *  defaults on absent / non-finite / negative values. */
export function resolveThresholds(env = process.env) {
  const num = (v, d) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    noiseFloor: num(env.SCREENSHOT_NOISE_FLOOR, THRESHOLD_DEFAULTS.noiseFloor),
    ceiling: num(env.SCREENSHOT_DIFF_CEILING, THRESHOLD_DEFAULTS.ceiling),
  };
}

/** Classify a raw ratio against the band. Below floor is noise; above
 *  ceiling is "too great"; in between is a legitimate refresh. */
export function decide(ratio, { noiseFloor, ceiling }) {
  if (ratio < noiseFloor) return 'skip';
  if (ratio > ceiling) return 'exceed';
  return 'write';
}

/** Copy an RGBA buffer into the top-left of a WxH transparent canvas.
 *  Lets us compare images whose dimensions drifted (e.g. a route got
 *  taller) instead of throwing -- the grown region reads as changed. */
function padTo(data, w, h, W, H) {
  if (w === W && h === H) return data;
  const out = Buffer.alloc(W * H * 4); // zero-filled = transparent black
  const srcRow = w * 4;
  const dstRow = W * 4;
  for (let y = 0; y < h; y++) {
    data.copy(out, y * dstRow, y * srcRow, y * srcRow + srcRow);
  }
  return out;
}

/** Decode two PNG buffers, pad to their union dimensions, and count
 *  mismatched pixels. Returns the change ratio over the union area. */
export function diffRatio(committedBuffer, freshBuffer) {
  const a = PNG.sync.read(committedBuffer);
  const b = PNG.sync.read(freshBuffer);
  const W = Math.max(a.width, b.width);
  const H = Math.max(a.height, b.height);
  const ad = padTo(a.data, a.width, a.height, W, H);
  const bd = padTo(b.data, b.width, b.height, W, H);
  const changedPixels = pixelmatch(ad, bd, null, W, H, { threshold: 0.1 });
  const totalPixels = W * H;
  return {
    changedPixels,
    totalPixels,
    ratio: totalPixels ? changedPixels / totalPixels : 0,
    width: W,
    height: H,
  };
}

/** Per-image decision. A missing baseline (committedBuffer == null) is a
 *  brand-new screenshot: always 'write', never 'exceed' (there's nothing
 *  to compare, and a first capture shouldn't trip the ceiling). */
export function classify(committedBuffer, freshBuffer, thresholds = resolveThresholds()) {
  if (committedBuffer == null) {
    return { decision: 'write', ratio: 1, isNew: true, changedPixels: 0, totalPixels: 0 };
  }
  const r = diffRatio(committedBuffer, freshBuffer);
  return { decision: decide(r.ratio, thresholds), isNew: false, ...r };
}
