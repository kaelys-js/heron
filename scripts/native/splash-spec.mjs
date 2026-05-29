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
 * Before this module existed each surface held a HAND-COPIED bloom + spinner +
 * mark, kept loosely aligned by one drift test. To change the look you edited
 * 5 files and hoped. Now you edit THIS file, run `pnpm brand:apply && pnpm
 * icons`, and every surface regenerates. `scripts/system/verify-splash-sync.mjs`
 * fails CI if any surface drifts from what this module emits.
 *
 * The SPLASH composition is Duolingo-flavoured: a SOLID background sampled from
 * the mascot's own darker-blue tone (branding/assets/mascot-b64.json::splashBg),
 * the friendly cartoon MASCOT that bounces in and idly bobs (lifted off the
 * same-tone ground by a soft drop shadow), and a dawn-gold progress arc. The
 * STILL frame (animated:false) is the exact resting frame, so the native-PNG ->
 * web-boot handoff is seamless (iOS-style). `prefers-reduced-motion` collapses
 * to the still frame. LOGIN/SIGNUP keep a SEPARATE treatment -- the layered
 * dawn-sky bloom (see bloomLayers) -- which is NOT used on the splash.
 *
 * Colors come from branding/brand.json; the mascot comes from
 * branding/assets/mascot-b64.json (encoded from the cleaned master by
 * brand-mascot.mjs). This module owns only the LOOK around them.
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

/** Mascot size on the splash. The web boot uses MARK_CLAMP (viewport-relative,
 *  ~28vh); the iOS launch PNG composites the mascot at MASCOT_SPLASH_FRACTION of
 *  the Splash.imageset canvas, kept roughly matching so the native -> web handoff
 *  is consistent. Both are the single source here (generate-icons.mjs reads the
 *  fraction). */
export const MARK_CLAMP = 'clamp(120px, 28vh, 280px)';
export const MASCOT_SPLASH_FRACTION = 0.34;

/** The dawn-sky bloom used as the LOGIN/SIGNUP background (a separate treatment
 *  from the splash, which is a solid mascot-sampled colour). A warm dawn-gold
 *  sunrise rises from the bottom through reed-green into slate night, with a
 *  soft halo + vignette. Emitted as a multi-background `background:` value.
 *  Layer order (CSS paints first = top of stack): vignette, sunrise, reed band,
 *  halo, night-sky base. */
export function bloomLayers(c) {
  const slate = rgb(c.primary);
  const reed = rgb(c.accentSecondary);
  const dawn = rgb(c.accent);
  return [
    `radial-gradient(135% 100% at 50% 50%, transparent 46%, rgba(0, 0, 0, 0.42) 100%)`,
    `radial-gradient(120% 85% at 50% 116%, rgba(${dawn}, 0.34) 0%, rgba(${dawn}, 0.12) 30%, transparent 58%)`,
    `radial-gradient(135% 95% at 50% 104%, rgba(${reed}, 0.2) 0%, transparent 62%)`,
    `radial-gradient(80% 62% at 50% 40%, rgba(${slate}, 0.26) 0%, rgba(${reed}, 0.1) 46%, transparent 74%)`,
    `linear-gradient(180deg, #090b0f 0%, ${c.darkBg} 44%, #11151c 100%)`,
  ];
}

/** Single-line form for an inline `style="background: ..."` attribute
 *  (login/signup), so the prettier-formatted Svelte files keep it on one
 *  line and never reflow it (which would drift from this source). */
export function bloomCssInline(c) {
  return bloomLayers(c).join(', ');
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
  .splash-mark-img { animation: splash-bob 3s ease-in-out 900ms infinite; }
  .splash-arc { opacity: 0; animation: splash-fade 520ms ease-out 1000ms forwards; }
  .splash-arc-ring { transform-origin: 18px 18px; animation: splash-spin 0.95s cubic-bezier(0.65, 0.05, 0.36, 1) infinite; }
  /* Mascot drops in, overshoots, settles, then idly bobs. */
  @keyframes splash-bounce {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
    55% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
    74% { transform: translate(-50%, -50%) scale(0.95); }
    88% { transform: translate(-50%, -50%) scale(1.02); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes splash-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5%); } }
  @keyframes splash-fade { to { opacity: 1; } }
  @keyframes splash-spin { to { transform: rotate(360deg); } }`
    : '';
  return `
  /* Solid background = a shade sampled from the mascot itself (single source:
     branding/assets/mascot-b64.json::splashBg). The mascot sits on this same-tone
     ground, lifted by a soft drop shadow. Layers stack by DOM order (bg -> mark
     -> arc); no z-index, so a sibling appended AFTER this block (app.html's boot
     error panel) naturally renders above the mark without extra rules. */
  .splash-bg { position: absolute; inset: 0; background: ${splashBg}; }
  .splash-mark {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: ${MARK_CLAMP}; height: ${MARK_CLAMP};
    display: flex; align-items: center; justify-content: center;
    filter: drop-shadow(0 18px 26px rgba(0, 0, 0, 0.4)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
  }
  .splash-mark-img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .splash-arc {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, calc(0.5 * ${MARK_CLAMP} + 56px));
    width: 40px; height: 40px;
  }${motion}
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
    <div${markIdAttr} class="splash-mark">
      <img class="splash-mark-img" src="${mascotDataUri}" alt="" aria-hidden="true" />
    </div>
    <div${arcIdAttr} class="splash-arc" role="progressbar" aria-label="Loading">
      ${buildArcSvg({ colors: c, idPrefix: 'sp' })}
    </div>
    <style>${splashStyle(splashBg, animated)}
    </style>`;
}

/** Full standalone splash document (loaded as a data: URL by Electron before
 *  the dev server / bundled app paints). Pure + testable. */
export function buildSplashHtml({ colors: c, splashBg, mascotDataUri, animated = true }) {
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
  ${buildSplashVisual({ colors: c, splashBg, mascotDataUri, animated })}
</body>
</html>`;
}
