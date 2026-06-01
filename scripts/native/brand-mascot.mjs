/**
 * brand-mascot.mjs -- encode the cleaned mascot master into the base64 forms the
 * brand surfaces embed, and read them back.
 *
 * The cleaned master (`branding/assets/mascot.png`, from process-mascot.mjs) is
 * the single source. `encodeMascot` (async, sharp) renders the three embeds the
 * surfaces need; `process-mascot.mjs` writes them to
 * `branding/assets/mascot-b64.json` (committed, turbo-cacheable). apply-brand +
 * splash-spec read that JSON SYNCHRONOUSLY via `readMascotB64`, so the big
 * apply-brand orchestrator stays synchronous and never re-encodes on every run.
 *
 * Embed sizes are tuned per context (crispness vs inline payload):
 *   - iconPng  256² PNG  (~25 KB b64): logo.svg / favicon.svg. PNG because resvg
 *                         (sharp's SVG rasteriser) renders PNG `<image>`, not WebP.
 *   - heroWebp 512² WebP (~26 KB b64): the splash hero (shown large).
 *   - markWebp 256² WebP (~13 KB b64): the small inline marks (login/signup/etc).
 * WebP is safe in every browser/WKWebView/Electron surface that consumes it.
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

/** Per-embed render spec. Keep keys in sync with the surfaces that read them. */
export const MASCOT_EMBEDS = {
  iconPng: { size: 256, format: 'png' },
  heroWebp: { size: 512, format: 'webp' },
  markWebp: { size: 256, format: 'webp' },
};

const masterPath = (rootDir) => join(rootDir, 'branding', 'assets', 'mascot.png');
const silhouettePath = (rootDir) => join(rootDir, 'branding', 'assets', 'mascot-silhouette.png');
export const mascotB64Path = (rootDir) => join(rootDir, 'branding', 'assets', 'mascot-b64.json');

/** Sample the mascot's darker-blue tone for the splash background, so the splash
 *  bg is literally a shade of the mascot (and re-samples when the mascot changes).
 *  Takes the ~10th-percentile bluish opaque pixel (the dark body/outline slate),
 *  giving a calm, on-mascot ground the mascot reads against (lifted by its shadow).
 *  Async (sharp). Returns a `#rrggbb` hex. */
export async function sampleSplashBg(rootDir) {
  const sharp = require(join(rootDir, 'ui', 'node_modules', 'sharp'));
  const { data, info } = await sharp(masterPath(rootDir))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const blues = [];
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = ch === 4 ? data[i + 3] : 255;
    if (a < 200) continue; // opaque mascot pixels only
    if (b >= r && b >= g - 4 && r + g + b < 470) blues.push([r, g, b, r + g + b]);
  }
  if (blues.length === 0) return '#3d505f'; // fallback if the mascot isn't bluish
  blues.sort((p, q) => p[3] - q[3]);
  const [r, g, b] = blues[Math.floor(blues.length * 0.1)];
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Render every embed from the cleaned master + sample the splash bg. Async (sharp). */
export async function encodeMascot(rootDir) {
  const sharp = require(join(rootDir, 'ui', 'node_modules', 'sharp'));
  const out = {};
  for (const [key, { size, format }] of Object.entries(MASCOT_EMBEDS)) {
    const base = sharp(masterPath(rootDir)).resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    const buf =
      format === 'webp'
        ? await base.webp({ quality: 82, alphaQuality: 90 }).toBuffer()
        : await base.png({ compressionLevel: 9, palette: true }).toBuffer();
    out[key] = `data:image/${format};base64,${buf.toString('base64')}`;
  }
  out.iconPngWhite = await encodeSilhouette(rootDir, MASCOT_EMBEDS.iconPng.size);
  out.splashBg = await sampleSplashBg(rootDir);
  return out;
}

/** The user-provided WHITE SILHOUETTE mascot for the app-icon glyph: the
 *  cleaned, cut-out master at branding/assets/mascot-silhouette.png (produced by
 *  process-mascot.cleanMaster from branding/mascot-silhouette.png), resized and
 *  encoded as PNG. apply-brand swaps it in for the full-colour mascot in
 *  favicon.svg, so every rasterised app icon shows the silhouette on the brand
 *  squircle. PNG because resvg (sharp's SVG rasteriser) renders PNG `<image>`. */
export async function encodeSilhouette(rootDir, size) {
  const sharp = require(join(rootDir, 'ui', 'node_modules', 'sharp'));
  const buf = await sharp(silhouettePath(rootDir))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Read the committed embeds synchronously (for apply-brand + splash-spec). */
export function readMascotB64(rootDir) {
  return JSON.parse(readFileSync(mascotB64Path(rootDir), 'utf8'));
}
