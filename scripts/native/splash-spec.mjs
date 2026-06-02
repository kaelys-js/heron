/**
 * splash-spec.mjs -- THE single source of truth for the launch/boot visual.
 *
 * Every splash & cold-boot surface in the app renders the SAME composition:
 *   - SvelteKit cold-boot screen   (ui/src/app.html #boot-fallback)
 *   - Electron pre-paint splash    (ui/electron/src/splash.ts)
 *   - iOS WebView boot screen      (ui/ios/App/App/public/index.html)
 *   - iOS native launch PNG        (Splash.imageset, via generate-icons.mjs)
 *   - login / signup atmosphere    (their gradient backdrop)
 *
 * Each surface used to hand-copy the bloom + spinner + mark, kept aligned by one
 * drift test. Now you edit THIS file, run `pnpm brand:apply && pnpm icons`, and
 * every surface regenerates; verify-splash-sync.mjs fails CI on any drift.
 *
 * SPLASH composition: a background sampled from the mascot's darker-blue tone
 * (mascot-b64.json::splashBg), given depth by a soft lens VIGNETTE + a fine film
 * GRAIN, with the cartoon MASCOT small + centered (~11% of the canvas, like a
 * home-screen icon, NOT a giant head) that bounces in and idly bobs over a soft
 * drop shadow, plus a dawn-gold progress arc below. The vignette is a gradient
 * on every surface; the grain is CSS-only, never baked into the iOS launch PNG
 * (see SPLASH_VIGNETTE / grainDataUri). The STILL frame (animated:false) is the
 * resting frame, so the native-PNG -> web-boot handoff does not jump;
 * `prefers-reduced-motion` collapses to it. LOGIN/SIGNUP keep a SEPARATE
 * treatment -- the layered dawn-sky bloom (see bloomLayers).
 *
 * Colors come from branding/brand.json; the mascot from mascot-b64.json
 * (encoded by brand-mascot.mjs). This module owns only the LOOK around them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMascotB64 } from './brand-mascot.mjs';

/** #rrggbb -> "r, g, b" (for rgba(...) interpolation). */
function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * Read the brand sources and return the inputs the builders need.
 * ONE reader shared by apply-brand + generate-icons + tests so the colors +
 * mascot can never diverge between the HTML surfaces and the rasterized PNG.
 * `mascot` carries the base64 embeds (heroWebp for the splash hero, etc.).
 */
export function loadBrandSource(rootDir) {
  const brand = JSON.parse(readFileSync(join(rootDir, 'branding', 'brand.json'), 'utf8'));
  return { colors: brand.colors, mascot: readMascotB64(rootDir) };
}

/** Mascot size on the splash. Small + centered, ~11% of the canvas (the same
 *  restrained proportion the home-screen icon uses) so the splash reads as an
 *  app icon, not a giant head. The web boot uses MARK_CLAMP (viewport-relative); the iOS
 *  launch PNG composites the mascot at MASCOT_SPLASH_FRACTION of the
 *  Splash.imageset canvas. Kept matching so the native -> web handoff is
 *  consistent (generate-icons.mjs reads the fraction). Bump them together. */
export const MARK_CLAMP = 'clamp(80px, max(11vh, 11vw), 200px)';
export const MASCOT_SPLASH_FRACTION = 0.11;

/** Splash depth = a soft lens VIGNETTE (a smooth radial darkening) + a fine film
 *  GRAIN. The VIGNETTE is a gradient, so it compresses cleanly -- it lives in
 *  BOTH the CSS surfaces and the iOS launch PNG. The GRAIN is a small tiled
 *  monochrome fractal-noise overlay that lives ONLY in the live CSS surfaces
 *  (web boot + Electron) and is NEVER baked into the iOS PNG: per-pixel noise is
 *  incompressible (it ballooned the 2732² PNG to ~7 MB) and Apple's launch image
 *  must be static anyway. Values tuned for a refined, cinematic look. */
export const SPLASH_VIGNETTE =
  'radial-gradient(ellipse at 50% 42%, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.12) 68%, rgba(0, 0, 0, 0.3) 100%)';

/** A small (300px) tiled, desaturated film-grain SVG data URI (fractal noise),
 *  repeated by the browser so the asset stays tiny. CSS-only; see SPLASH_VIGNETTE. */
export function grainDataUri() {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#n)'/></svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The dawn-sky bloom used as the shared auth/boot background. A SINGLE warm
 *  dawn-gold glow rises from the BOTTOM (sunrise through reed-green), over the
 *  night-sky base, with a soft edge vignette. No second glow behind the
 *  subject -- the bottom bloom is the only light source. Emitted as a
 *  multi-background `background:` value; layer order (CSS paints first = top of
 *  stack): vignette, sunrise, reed band, night-sky base.
 *
 *  The glow alphas are deliberately restrained (~half the original) so the
 *  bloom reads as a quiet atmosphere behind the content, not a spotlight; a
 *  slight film grain (see bloomGrainStyle) sits on top to break up banding. */
export function bloomLayers(c) {
  const reed = rgb(c.accentSecondary);
  const dawn = rgb(c.accent);
  return [
    `radial-gradient(135% 100% at 50% 50%, transparent 46%, rgba(0, 0, 0, 0.42) 100%)`,
    `radial-gradient(120% 85% at 50% 116%, rgba(${dawn}, 0.17) 0%, rgba(${dawn}, 0.06) 30%, transparent 58%)`,
    `radial-gradient(135% 95% at 50% 104%, rgba(${reed}, 0.1) 0%, transparent 62%)`,
    `linear-gradient(180deg, #090b0f 0%, ${c.darkBg} 44%, #11151c 100%)`,
  ];
}

/** Light-mode counterpart of bloomLayers: the SAME dawn-gold + reed glow rising
 *  from the bottom, but over a warm off-white ground with a gentle edge shade
 *  instead of the night-sky base. Without this, a dark glow stack sits over the
 *  cream light-mode page. Alphas match the dark variant's restrained intensity
 *  while staying legible on a light surface. */
export function bloomLayersLight(c) {
  const reed = rgb(c.accentSecondary);
  const dawn = rgb(c.accent);
  const lightBg = c.lightBg ?? '#f7f5f0';
  return [
    `radial-gradient(135% 100% at 50% 50%, transparent 58%, rgba(60, 50, 30, 0.07) 100%)`,
    `radial-gradient(120% 85% at 50% 116%, rgba(${dawn}, 0.2) 0%, rgba(${dawn}, 0.07) 32%, transparent 60%)`,
    `radial-gradient(135% 95% at 50% 104%, rgba(${reed}, 0.12) 0%, transparent 64%)`,
    `linear-gradient(180deg, #ffffff 0%, ${lightBg} 46%, #efece3 100%)`,
  ];
}

/** Single-line form for an inline `style="background: ..."` attribute
 *  (login/signup), so the prettier-formatted Svelte files keep it on one
 *  line and never reflow it (which would drift from this source). */
export function bloomCssInline(c) {
  return bloomLayers(c).join(', ');
}

/** Light-mode single-line form (see bloomCssInline). */
export function bloomCssInlineLight(c) {
  return bloomLayersLight(c).join(', ');
}

/** Inline style for the bloom's grain overlay: the same tiled fractal-noise
 *  data URI the splash uses (grainDataUri), kept very light so it just breaks up
 *  gradient banding. The URI is single-quoted in `url('...')` so it survives
 *  inside a double-quoted `style="..."` attribute -- and grainDataUri leaves raw
 *  `'` in the SVG (encodeURIComponent doesn't escape it), so we percent-encode
 *  those to %27 first or they'd close the url() early. */
export function bloomGrainStyle() {
  const uri = grainDataUri().replace(/'/g, '%27');
  return `background-image: url('${uri}'); background-size: 300px 300px; opacity: 0.06; mix-blend-mode: soft-light;`;
}

/** The dawn-gold progress arc -- a thin gradient ring that rotates. Replaces
 *  the old orbital spinner; dawn-led to echo the "stand still at dawn"
 *  narrative. `idPrefix` scopes its gradient id. */
export function buildArcSvg({ colors: c, idPrefix = 'sp' }) {
  const gid = `${idPrefix}-arc`;
  const reed = rgb(c.accentSecondary);
  return `<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style="display:block">
      <defs>
        <linearGradient id="${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.15" />
          <stop offset="45%" stop-color="${c.accentSecondary}" stop-opacity="0.7" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="1" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(${reed}, 0.12)" stroke-width="2.5" />
      <circle cx="18" cy="18" r="14" fill="none" stroke="url(#${gid})" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="52 88" class="splash-arc-ring" />
    </svg>`;
}

/** The CSS for the full splash visual. `splashBg` is the solid background
 *  (sampled from the mascot). `animated` gates all motion; the reduced-motion
 *  media query always collapses to the still frame. */
function splashStyle(splashBg, animated) {
  const motion = animated
    ? `
  .splash-mark { animation: splash-bounce 820ms cubic-bezier(0.22, 1.2, 0.36, 1) both; }
  .splash-mark-img { animation: splash-rebounce 2.6s ease-in-out 1100ms infinite; }
  .splash-arc { opacity: 0; animation: splash-fade 520ms ease-out 1000ms forwards; }
  .splash-arc-ring { transform-origin: 18px 18px; animation: splash-spin 0.95s cubic-bezier(0.65, 0.05, 0.36, 1) infinite; }
  /* Mascot drops in (entrance), then re-bounces the SAME lively pop on a loop, so
     the motion is identical on every boot surface regardless of how long it is
     shown (a long wait keeps bouncing; a brief one shows the same bounce). The
     re-bounce rests at scale(1) for most of the cycle, then pops, so the loop
     seam doesn't show -- the mascot never shrinks away or disappears. */
  @keyframes splash-bounce {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
    55% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
    74% { transform: translate(-50%, -50%) scale(0.95); }
    88% { transform: translate(-50%, -50%) scale(1.02); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes splash-rebounce {
    0%, 62%, 100% { transform: scale(1); }
    72% { transform: scale(1.08); }
    82% { transform: scale(0.95); }
    91% { transform: scale(1.02); }
  }
  @keyframes splash-fade { to { opacity: 1; } }
  @keyframes splash-spin { to { transform: rotate(360deg); } }`
    : '';
  return `
  /* Solid background = a shade sampled from the mascot itself (single source:
     branding/assets/mascot-b64.json::splashBg), given depth by a soft vignette
     (behind the mascot) and a fine film grain (over the whole frame). The bare
     mascot sits on this same-tone ground, lifted by a soft drop shadow. Layers
     stack by DOM order (bg -> vignette -> mark -> arc -> grain); no z-index, so
     a sibling appended AFTER this block (app.html's boot error panel) renders
     above without extra rules. */
  .splash-bg { position: absolute; inset: 0; background: ${splashBg}; }
  .splash-vignette { position: absolute; inset: 0; pointer-events: none; background: ${SPLASH_VIGNETTE}; }
  .splash-grain {
    position: absolute; inset: 0; pointer-events: none;
    background-image: url("${grainDataUri()}");
    background-size: 300px 300px; opacity: 0.11; mix-blend-mode: overlay;
  }
  .splash-mark {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: ${MARK_CLAMP}; height: ${MARK_CLAMP};
    display: flex; align-items: center; justify-content: center;
    filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.4)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.26));
  }
  .splash-mark-img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .splash-arc {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, calc(0.5 * ${MARK_CLAMP} + 40px));
    width: 36px; height: 36px;
  }
  /* Dawn-motes particle zones (filled by the shared heron-particles bundle).
     Behind the mascot; two clusters: top-right + the bottom band. */
  .splash-particles { position: absolute; inset: 0; pointer-events: none; }
  .splash-particles-tr { position: absolute; right: 0; top: 0; width: 48%; height: 44%; }
  .splash-particles-bottom { position: absolute; left: 0; bottom: 0; width: 100%; height: 30%; }${motion}
  @media (prefers-reduced-motion: reduce) {
    .splash-mark, .splash-mark-img, .splash-arc, .splash-arc-ring { animation: none !important; }
    .splash-mark { opacity: 1; transform: translate(-50%, -50%); }
    .splash-arc { opacity: 1; }
  }`;
}

/** Build the splash VISUAL fragment (no document wrapper): the solid sampled
 *  background, the centered mascot (with a soft drop shadow), the dawn-gold arc
 *  loader, and a scoped <style>. Used inside app.html's #boot-fallback and the
 *  iOS WebView boot screen (which supply their own container + boot JS).
 *  `markId`/`arcId` keep the IDs those surfaces' error-state CSS + boot driver
 *  depend on. */
export function buildSplashVisual({ colors: c, splashBg, mascotDataUri, animated, markId, arcId }) {
  const markIdAttr = markId ? ` id="${markId}"` : '';
  const arcIdAttr = arcId ? ` id="${arcId}"` : '';
  return `<div class="splash-bg" aria-hidden="true"></div>
    <div class="splash-vignette" aria-hidden="true"></div>
    <div class="splash-particles" aria-hidden="true">
      <div class="splash-particles-tr" data-heron-particles data-zone="top-right" data-count="22"></div>
      <div class="splash-particles-bottom" data-heron-particles data-zone="bottom" data-count="28"></div>
    </div>
    <div${markIdAttr} class="splash-mark">
      <img class="splash-mark-img" src="${mascotDataUri}" alt="" aria-hidden="true" />
    </div>
    <div${arcIdAttr} class="splash-arc" role="progressbar" aria-label="Loading">
      ${buildArcSvg({ colors: c, idPrefix: 'sp' })}
    </div>
    <div class="splash-grain" aria-hidden="true"></div>
    <style>${splashStyle(splashBg, animated)}
    </style>`;
}

/** Full standalone splash document (loaded as a data: URL by Electron before
 *  the dev server / bundled app paints). Pure + testable. */
export function buildSplashHtml({
  colors: c,
  splashBg,
  mascotDataUri,
  animated = true,
  particlesScript = '',
}) {
  // The Electron splash is a data: URL loaded before any server, so it can't
  // fetch /heron-particles.js -- apply-brand passes the bundle's source and we
  // inline it here. Same bundle, same dawn-motes effect as every other surface.
  // Escape any `</script` in the bundle so it can't close the inline tag early.
  const particles = particlesScript
    ? `\n  <script>${particlesScript.replace(/<\/script/gi, '<\\/script')}</script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Loading</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    position: relative; overflow: hidden;
    background: ${splashBg}; color: ${c.textOnDark};
    -webkit-user-select: none; user-select: none;
  }
</style>
</head>
<body>
  ${buildSplashVisual({ colors: c, splashBg, mascotDataUri, animated })}${particles}
</body>
</html>`;
}
