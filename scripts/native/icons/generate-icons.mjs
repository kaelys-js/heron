#!/usr/bin/env node
/**
 * generate-icons.mjs -- render master SVG into every platform asset size.
 *
 * Inputs:
 *   ui/static/favicon.svg          (32×32 master, gradient-based -- scales fine)
 *
 * Outputs:
 *   scripts/native/icons/_build/{size}.png    (raw renders)
 *   ui/electron/build/icon.png                512×512 (electron-builder reads this)
 *   ui/electron/build/icon.icns               macOS bundle (built via iconutil)
 *   ui/electron/build/icon.ico                Windows (built via png2ico or ImageMagick)
 *   ui/ios/App/App/Assets.xcassets/AppIcon.appiconset/{slot}.png  (iOS app icons)
 *   ui/static/icons/{size}.png                Web manifest + tray
 *
 * Uses sharp for SVG→PNG rendering, since it's already a transitive dep
 * (vite + svelte pull it in). For .icns / .ico generation we shell out
 * to native CLI tools (`iconutil` is bundled with macOS; `magick` falls
 * back if available).
 */
import fs from 'node:fs/promises';
import { readFileSync as fsReadFileSync, accessSync, constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadBrandSource, MASCOT_SPLASH_FRACTION } from '../splash-spec.mjs';

// Safe PATH allowlist for resolving auxiliary build tools (iconutil,
// png2icns, magick, convert). The original `execSync('which X')` pattern
// was flagged by CodeQL's `js/shell-command-injection-from-environment`
// because PATH is env-controlled -- a malicious PATH could redirect to
// a different binary. Resolving against a literal-array allowlist
// constrains the lookup to known system + homebrew directories.
const SAFE_PATH_DIRS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];

/** Find the absolute path of `cmd` on the safe-PATH allowlist, or null
 *  if not present. Replaces `execSync('which cmd')` patterns. */
function resolveOnSafePath(cmd) {
  for (const dir of SAFE_PATH_DIRS) {
    const candidate = path.join(dir, cmd);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      /* not in this dir; try next */
    }
  }
  return null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/native/icons/generate-icons.mjs → repo root is 3 dirs up.
const ROOT = path.resolve(__dirname, '../../..');
const SVG = path.join(ROOT, 'ui/static/favicon.svg');
const BUILD = path.join(__dirname, '_build');

/**
 * Scale the `<image>` inside an SVG fragment about its OWN centre by `scale`,
 * leaving every other element (the gradient squircle `<rect>`, etc.) untouched.
 * Centre-preserving: recomputes x/y so the mark stays put while it grows/shrinks.
 * Used by the macOS dock tile to make the heron read larger inside the squircle
 * without disturbing the card. Pure; returns the fragment unchanged if it has no
 * `<image>`. Exported for unit testing.
 */
export function scaleSvgImage(svgInner, scale) {
  return svgInner.replace(/<image\b[^>]*>/, (tag) => {
    const read = (attr) => {
      const m = tag.match(new RegExp(`\\b${attr}="([\\d.]+)"`));
      return m ? Number.parseFloat(m[1]) : null;
    };
    const x = read('x');
    const y = read('y');
    const w = read('width');
    const h = read('height');
    if (x === null || y === null || w === null || h === null) return tag;
    const nw = w * scale;
    const nh = h * scale;
    const nx = x + w / 2 - nw / 2;
    const ny = y + h / 2 - nh / 2;
    const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
    return tag
      .replace(/\bx="[\d.]+"/, `x="${fmt(nx)}"`)
      .replace(/\by="[\d.]+"/, `y="${fmt(ny)}"`)
      .replace(/\bwidth="[\d.]+"/, `width="${fmt(nw)}"`)
      .replace(/\bheight="[\d.]+"/, `height="${fmt(nh)}"`);
  });
}

// Read brand.json so the web-manifest filenames track the brand name.
// Previously hardcoded `heron-${size}.png`; if the user renamed the
// brand to e.g. "myapp" the generator would still write
// `heron-192.png` and app.html / manifest.webmanifest would
// reference the wrong filenames. Reading from brand.json keeps the
// generated filename in sync with whatever apply-brand.mjs propagated
// into app.html (single source of truth: branding/brand.json).
const BRAND_NAME = (() => {
  try {
    const brand = JSON.parse(fsReadFileSync(path.join(ROOT, 'branding', 'brand.json'), 'utf8'));
    return brand.name || 'icon';
  } catch {
    // Generator runs in CI with `node scripts/native/icons/generate-icons.mjs`
    // (no apply-brand wrapper). If brand.json is missing, fall back to
    // a brand-agnostic "icon" prefix rather than throwing -- the
    // manifest just needs SOME consistent filenames.
    return 'icon';
  }
})();

// Cache key -- sha256 of the source SVG bytes. If it matches the cached
// value, every output PNG is already up-to-date and the whole 80-render
// pipeline can short-circuit. Set `--force` (or env ICONS_FORCE=1) to
// override. Cache file: `scripts/native/icons/_build/.cache-hash`.
const CACHE_KEY_FILE = path.join(BUILD, '.cache-hash');

// Standard size matrix.
const SIZES = [
  16, 20, 24, 29, 32, 40, 48, 50, 57, 58, 60, 64, 72, 76, 80, 87, 96, 100, 114, 120, 128, 144, 152,
  167, 180, 192, 256, 384, 512, 1024,
];

// Per-platform target slots.
const IOS_SLOTS = [
  // iPhone notifications
  { size: 20, scale: 2, name: 'AppIcon-20@2x.png', idiom: 'iphone' },
  { size: 20, scale: 3, name: 'AppIcon-20@3x.png', idiom: 'iphone' },
  // iPhone settings
  { size: 29, scale: 2, name: 'AppIcon-29@2x.png', idiom: 'iphone' },
  { size: 29, scale: 3, name: 'AppIcon-29@3x.png', idiom: 'iphone' },
  // iPhone spotlight
  { size: 40, scale: 2, name: 'AppIcon-40@2x.png', idiom: 'iphone' },
  { size: 40, scale: 3, name: 'AppIcon-40@3x.png', idiom: 'iphone' },
  // iPhone app
  { size: 60, scale: 2, name: 'AppIcon-60@2x.png', idiom: 'iphone' },
  { size: 60, scale: 3, name: 'AppIcon-60@3x.png', idiom: 'iphone' },
  // iPad notifications + settings + spotlight + app
  { size: 20, scale: 1, name: 'AppIcon-20.png', idiom: 'ipad' },
  { size: 20, scale: 2, name: 'AppIcon-20@2x~ipad.png', idiom: 'ipad' },
  { size: 29, scale: 1, name: 'AppIcon-29.png', idiom: 'ipad' },
  { size: 29, scale: 2, name: 'AppIcon-29@2x~ipad.png', idiom: 'ipad' },
  { size: 40, scale: 1, name: 'AppIcon-40.png', idiom: 'ipad' },
  { size: 40, scale: 2, name: 'AppIcon-40@2x~ipad.png', idiom: 'ipad' },
  { size: 76, scale: 1, name: 'AppIcon-76.png', idiom: 'ipad' },
  { size: 76, scale: 2, name: 'AppIcon-76@2x.png', idiom: 'ipad' },
  { size: 83.5, scale: 2, name: 'AppIcon-83.5@2x.png', idiom: 'ipad' },
  // App Store
  { size: 1024, scale: 1, name: 'AppIcon-1024.png', idiom: 'ios-marketing' },
];

const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]; // macOS expects iconset entries at these

async function ensureDirs() {
  await fs.mkdir(BUILD, { recursive: true });
  await fs.mkdir(path.join(ROOT, 'ui/electron/build'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'ui/static/icons'), { recursive: true });
}

async function loadSharp() {
  // sharp is a `ui`-workspace dependency. Resolving it from this script (run
  // from the repo root) has two cross-platform traps that the previous
  // try/next/swallow loop hid behind a misleading "Missing peer dep":
  //   1. A bare `import('sharp')` can't see sharp from the repo-root cwd under
  //      pnpm's `node-linker=isolated` -- sharp lives in ui/node_modules, not
  //      hoisted to the root, so bare resolution misses it.
  //   2. A raw ABSOLUTE path can't be handed to dynamic import() on Windows:
  //      `C:\...\index.js` parses as a URL whose scheme is `c:`, so import()
  //      throws ERR_UNSUPPORTED_ESM_URL_SCHEME. POSIX absolute paths import
  //      fine, which is why ubuntu/macOS passed and only Windows failed here.
  //      Every path candidate must go through pathToFileURL() first.
  const require = createRequire(import.meta.url);
  const attempts = [
    // Resolve sharp's entry from the ui workspace regardless of cwd.
    () => require.resolve('sharp', { paths: [path.join(ROOT, 'ui')] }),
    // Explicit fallback to the known on-disk entry.
    () => path.join(ROOT, 'ui/node_modules/sharp/lib/index.js'),
  ];
  const errors = [];
  for (const resolve of attempts) {
    try {
      const mod = await import(pathToFileURL(resolve()).href);
      return mod.default ?? mod;
    } catch (e) {
      errors.push(e.message);
    }
  }
  // Last resort: bare specifier (works only when invoked from inside ui/).
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch (e) {
    errors.push(e.message);
  }
  console.error('Could not load sharp. Tried, in order:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('If sharp is genuinely missing: cd ui && pnpm add -D sharp');
  process.exit(1);
}

async function renderAtSize(sharp, svg, size, outPath, opaque = false) {
  let pipe = sharp(svg).resize(Math.round(size), Math.round(size), {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  // App Store app icons (iOS + watchOS) must have NO alpha channel -- App
  // Store Connect rejects transparent/alpha icons. Flatten onto the brand
  // dark background to drop the channel. macOS / web icons keep their alpha
  // (squircle shape, favicon transparency).
  if (opaque) pipe = pipe.flatten({ background: '#0e1014' });
  // Palette-quantise every icon: the mark is a flat cartoon, so a 256-colour
  // indexed PNG is visually identical but multiples smaller than full RGBA
  // (e.g. AppIcon-1024 ~330 KB -> ~80 KB), matching the original glyph icons.
  await pipe.png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toFile(outPath);
}

async function readCacheKey() {
  try {
    return (await fs.readFile(CACHE_KEY_FILE, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function writeCacheKey(key) {
  try {
    await fs.writeFile(CACHE_KEY_FILE, key + '\n');
  } catch {
    /* non-fatal */
  }
}

async function main() {
  await ensureDirs();
  const svgBuffer = await fs.readFile(SVG);

  // Short-circuit when the source SVG hasn't changed. The cache key
  // is `sha256(svg) + ":" + size-matrix-fingerprint` so changing either
  // the source OR the matrix invalidates.
  const force = process.argv.includes('--force') || process.env.ICONS_FORCE === '1';
  const matrixKey = JSON.stringify({
    sizes: SIZES,
    ios: IOS_SLOTS.map((s) => `${s.name}:${s.size}@${s.scale}`),
    icns: ICNS_SIZES,
    // Bump when render LOGIC changes (not just the matrix), so the cache
    // busts. v2: iOS + watch app icons flattened opaque (no alpha channel).
    // v3: single-glow bloom (was two stacked radials) + macOS .icns inset to
    // Apple's 824/1024 icon grid (Dock-size parity with stock apps).
    // v4: splash bloom now sourced from splash-spec.mjs (buildBloomSvg) -- the
    // crop-safe centered halo + vignette, shared with the web boot screen.
    // v5: brand mark is the cartoon MASCOT -- icons composite the mascot-on-squircle
    // (via favicon.svg) and the Splash.imageset is the BARE mascot on the halo.
    // v6: splash = solid mascot-sampled bg + centered mascot + soft drop shadow.
    // v7: small (~11%) centered mascot + soft lens vignette (grain is CSS-only,
    //     never baked here -- keeps the PNG compressible).
    // v8: macOS dock tile scales the heron 1.5x inside the squircle (scaleSvgImage).
    renderRev: 8,
  });
  const key = createHash('sha256').update(svgBuffer).update(matrixKey).digest('hex').slice(0, 16);
  const prev = await readCacheKey();
  // Verify the canonical outputs still exist before trusting the cache.
  // CI starts fresh: the cache key file may be missing OR the outputs
  // may have been .gitignored, in which case we must re-render.
  const canonicalOutputs = [
    path.join(ROOT, 'ui/electron/build/icon.png'),
    path.join(ROOT, 'ui/electron/build/icon.icns'),
    path.join(ROOT, 'ui/electron/build/icon.ico'),
    // Web-manifest icons use brand.name as the filename prefix so a
    // rebrand (BRAND.name change) auto-updates the filenames. See
    // applyManifest in apply-brand.mjs for the consumer side that
    // points at the same filenames.
    path.join(ROOT, `ui/static/icons/${BRAND_NAME}-192.png`),
    path.join(ROOT, `ui/static/icons/${BRAND_NAME}-512.png`),
    path.join(ROOT, 'ui/static/favicon.ico'),
    path.join(ROOT, 'ui/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'),
  ];
  const outputsExist = await Promise.all(
    canonicalOutputs.map(async (p) => {
      try {
        await fs.stat(p);
        return true;
      } catch {
        return false;
      }
    }),
  );
  if (!force && prev === key && outputsExist.every(Boolean)) {
    console.log(`✓ Icons unchanged (cache=${key}) — skipping render`);
    return;
  }
  if (prev === key && !outputsExist.every(Boolean)) {
    console.log(`◯ Icon cache hit but outputs missing on disk — re-rendering`);
  }
  const sharp = await loadSharp();

  console.log('Rendering raw sizes...');
  for (const s of SIZES) {
    const out = path.join(BUILD, `${s}.png`);
    await renderAtSize(sharp, svgBuffer, s, out);
  }
  console.log(`  ${SIZES.length} PNG sizes rendered`);

  // ---- iOS AppIcon.appiconset ----
  // iOS 18 supports three "appearances" per app icon: light (default),
  // dark (transparent background composited over the user's wallpaper),
  // and tinted (monochrome icon that picks up the user's accent colour).
  // For most apps the same artwork renders correctly in all three --
  // tinted just gets desaturated by iOS. We register all three so the
  // App Store reports "Full iOS 18 support" rather than "Light only".
  console.log('Building iOS AppIcon.appiconset (light + dark + tinted)...');
  const iosDir = path.join(ROOT, 'ui/ios/App/App/Assets.xcassets/AppIcon.appiconset');
  await fs.mkdir(iosDir, { recursive: true });
  const iosContents = { images: [], info: { version: 1, author: 'xcode' } };
  for (const slot of IOS_SLOTS) {
    const px = Math.round(slot.size * slot.scale);
    const out = path.join(iosDir, slot.name);
    await renderAtSize(sharp, svgBuffer, px, out, true);
    iosContents.images.push({
      idiom: slot.idiom,
      size: `${slot.size}x${slot.size}`,
      scale: `${slot.scale}x`,
      filename: slot.name,
    });
  }
  // iOS 18 dark + tinted entries -- use the same 1024 marketing artwork
  // for each appearance. Xcode auto-derives the smaller sizes from the
  // 1024 source on devices that support per-appearance icons.
  for (const appearance of ['dark', 'tinted']) {
    const fname = `AppIcon-1024-${appearance}.png`;
    await renderAtSize(sharp, svgBuffer, 1024, path.join(iosDir, fname), true);
    iosContents.images.push({
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024',
      filename: fname,
      appearances: [
        appearance === 'dark'
          ? { appearance: 'luminosity', value: 'dark' }
          : { appearance: 'luminosity', value: 'tinted' },
      ],
    });
  }
  await fs.writeFile(path.join(iosDir, 'Contents.json'), JSON.stringify(iosContents, null, 2));
  console.log(`  ${IOS_SLOTS.length} iOS slots + dark + tinted + Contents.json`);

  // ---- iOS Splash.imageset (LaunchScreen + @capacitor/splash-screen) ----
  // Without this, the iOS app ships the Capacitor default X logo from
  // Capacitor's project template. We render a 2732×2732 image with the
  // brand logo at ~26% size, centered on the splash background colour from
  // brand.json. Used for both the static LaunchScreen.storyboard AND the
  // post-launch @capacitor/splash-screen overlay (which the SvelteKit
  // root layout calls SplashScreen.hide() to dismiss on first paint).
  console.log('Building iOS Splash.imageset...');
  const splashDir = path.join(ROOT, 'ui/ios/App/App/Assets.xcassets/Splash.imageset');
  await fs.mkdir(splashDir, { recursive: true });
  const splashSize = 2732;
  // Mascot proportion = MASCOT_SPLASH_FRACTION of the 2732 canvas, the SAME
  // fraction the web boot's MARK_CLAMP targets, so the iOS native splash and the
  // SvelteKit boot-fallback render the mascot at a matching size/position under
  // scaleAspectFill. Single source in splash-spec.mjs.
  const mascotSize = Math.round(splashSize * MASCOT_SPLASH_FRACTION);
  // Solid background = the mascot-sampled splash colour (single source:
  // branding/assets/mascot-b64.json::splashBg, via brand-mascot.mjs).
  const { mascot } = loadBrandSource(ROOT);
  const splashBg = mascot.splashBg ?? '#3d505f';

  // Build the still splash frame: solid bg + the centered mascot with a soft
  // drop shadow (mirrors the web boot's .splash-mark shadow so the native ->
  // web handoff matches). No animated loader in the static PNG. Full-res cleaned
  // master embedded for crispness (build-time, payload irrelevant).
  const mascotMaster = path.join(ROOT, 'branding/assets/mascot.png');
  const mascotB64 = (await fs.readFile(mascotMaster)).toString('base64');
  const mascotOffset = Math.round((splashSize - mascotSize) / 2);
  // Vignette mirrors the web boot's .splash-vignette (splash-spec.mjs
  // SPLASH_VIGNETTE). It's a smooth gradient, so it palette-compresses cleanly.
  // The web boot's film GRAIN is deliberately NOT baked here: per-pixel noise is
  // incompressible (it ballooned this PNG to ~7 MB) and the iOS launch image
  // must be static -- grain lives only in the live CSS layer painted over it.
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${splashSize}" height="${splashSize}" viewBox="0 0 ${splashSize} ${splashSize}">
    <defs>
      <filter id="mascotShadow" x="-40%" y="-40%" width="180%" height="180%">
        <!-- Soft dark drop shadow under the mascot (blur the silhouette, flood
             black, offset down, merge behind), matching the web .splash-mark. -->
        <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(mascotSize * 0.05)}" result="blur"/>
        <feOffset in="blur" dx="0" dy="${Math.round(mascotSize * 0.06)}" result="off"/>
        <feFlood flood-color="#000000" flood-opacity="0.42" result="col"/>
        <feComposite in="col" in2="off" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <radialGradient id="vignette" cx="50%" cy="42%" r="75%">
        <stop offset="35%" stop-color="#000000" stop-opacity="0" />
        <stop offset="68%" stop-color="#000000" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.3" />
      </radialGradient>
    </defs>
    <rect width="${splashSize}" height="${splashSize}" fill="${splashBg}" />
    <rect width="${splashSize}" height="${splashSize}" fill="url(#vignette)" />
    <image x="${mascotOffset}" y="${mascotOffset}" width="${mascotSize}" height="${mascotSize}" filter="url(#mascotShadow)" href="data:image/png;base64,${mascotB64}" />
  </svg>`;

  const splashBuffer = await sharp(Buffer.from(fullSvg))
    .resize(splashSize, splashSize, { fit: 'cover' })
    // Palette-quantise: solid bg + flat mascot + soft shadow reduce to a small
    // colour set, so a 256-colour PNG is visually identical but ~3x smaller than
    // full RGBA (the 2732² splash drops from ~770 KB to ~250 KB).
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
  // iOS expects three @1x/@2x/@3x variants under the same imageset; we
  // render the same 2732 image for all three (iOS scales down for older
  // devices; the launch screen storyboard pins the image to the safe
  // area, so over-resolution is fine).
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await fs.writeFile(path.join(splashDir, name), splashBuffer);
  }
  // Contents.json -- preserve the @1x/@2x/@3x mapping Capacitor wrote.
  await fs.writeFile(
    path.join(splashDir, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          { idiom: 'universal', filename: 'splash-2732x2732-2.png', scale: '1x' },
          { idiom: 'universal', filename: 'splash-2732x2732-1.png', scale: '2x' },
          { idiom: 'universal', filename: 'splash-2732x2732.png', scale: '3x' },
        ],
        info: { version: 1, author: 'xcode' },
      },
      null,
      2,
    ),
  );
  console.log(`  Splash.imageset rendered (${splashSize}×${splashSize}, bg=${splashBg})`);

  // ---- Electron icons ----
  console.log('Building Electron icons...');
  const electronBuild = path.join(ROOT, 'ui/electron/build');
  await renderAtSize(sharp, svgBuffer, 512, path.join(electronBuild, 'icon.png'));
  await renderAtSize(sharp, svgBuffer, 256, path.join(electronBuild, 'icon-256.png'));
  await renderAtSize(sharp, svgBuffer, 1024, path.join(electronBuild, 'icon-1024.png'));

  // Menu-bar / tray icon: the BARE mascot (NO squircle), trimmed of its
  // transparent margin so it fills the small icon, on a transparent canvas.
  // tray.ts loads this (not icon.png) so the menu bar shows the mascot itself,
  // not the gradient app-icon tile. 44px = crisp at the 22pt menu-bar size.
  await sharp(path.join(ROOT, 'branding/assets/mascot.png'))
    .trim()
    .resize(44, 44, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(path.join(electronBuild, 'tray.png'));

  // Bare mascot (no squircle) for the About window logo. Larger than the tray
  // icon so it's crisp at the ~78px About hero size.
  await sharp(path.join(ROOT, 'branding/assets/mascot.png'))
    .trim()
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(path.join(electronBuild, 'mascot.png'));

  // macOS dock tile -- Apple's icon grid insets the rounded-rect "card"
  // to 824/1024 of the canvas (≈100px transparent margin per side, plus
  // room for the system drop shadow). Every stock macOS app follows this,
  // so a full-bleed squircle renders visibly LARGER than its neighbours in
  // the Dock. We wrap the full favicon (squircle + glyph as one unit, so
  // its corner radius scales with it -- 232/1024 ≈ 186/824, matching
  // Apple's ~185px card radius) at 0.8047 scale, centered on a transparent
  // canvas. macOS-only: iOS auto-masks (wants full-bleed), Windows/Linux
  // tiles aren't Apple-grid, so those keep `svgBuffer` untouched.
  // logoInner = favicon.svg's inner content (the gradient squircle + the mascot
  // <image>) so the inset tile carries the same icon-form mark as the others.
  const faviconSvgText = await fs.readFile(SVG, 'utf8');
  const logoInner = faviconSvgText
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '');
  // Dock-only: scale the heron 1.5x WITHIN the squircle so the bird reads larger
  // in the Dock (the gradient card stays the Apple-grid size; only the <image>
  // grows, centre-preserved). iOS (`svgBuffer`) + web favicon keep the full-bleed
  // 66% mark, so this is scoped to the macOS dock tile and never couples to them.
  const DOCK_HERON_SCALE = 1.5;
  const dockLogoInner = scaleSvgImage(logoInner, DOCK_HERON_SCALE);
  const macIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(100, 100) scale(0.8046875)">${dockLogoInner}</g></svg>`;
  const macIconBuffer = Buffer.from(macIconSvg);

  // macOS Dock PNG -- the SAME Apple-grid inset as the .icns (824/1024 card),
  // as a standalone high-res PNG. app.dock.setIcon() loads THIS rather than the
  // full-bleed icon.png, so the dev Dock tile is correctly inset (matches stock
  // apps) even when nativeImage can't parse the .icns in dev.
  await sharp(macIconBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(path.join(electronBuild, 'dock.png'));

  // .icns (macOS) -- prefer iconutil (macOS-native, best output) and fall
  // back to png2icns (libicns, available on Linux CI via icnsutils).
  // Both produce the same wire format; iconutil's output is just a hair
  // smaller because it deduplicates @1x/@2x pairs.
  const icnsPath = path.join(electronBuild, 'icon.icns');
  const iconutilBin = resolveOnSafePath('iconutil');
  const png2icnsBin = resolveOnSafePath('png2icns');
  if (iconutilBin) {
    const iconset = path.join(electronBuild, 'icon.iconset');
    await fs.rm(iconset, { recursive: true, force: true });
    await fs.mkdir(iconset, { recursive: true });
    const icnsMatrix = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' },
    ];
    for (const { size, name } of icnsMatrix) {
      await renderAtSize(sharp, macIconBuffer, size, path.join(iconset, name));
    }
    execFileSync(iconutilBin, ['-c', 'icns', iconset, '-o', icnsPath], { stdio: 'inherit' });
    await fs.rm(iconset, { recursive: true });
    console.log('  icon.icns generated (iconutil)');
  } else if (png2icnsBin) {
    // png2icns expects discrete PNGs at icon-size boundaries.
    const sizes = [16, 32, 48, 128, 256, 512, 1024];
    const tmpDir = path.join(electronBuild, 'icon.tmp');
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFiles = [];
    for (const s of sizes) {
      const p = path.join(tmpDir, `icon_${s}.png`);
      await renderAtSize(sharp, macIconBuffer, s, p);
      tmpFiles.push(p);
    }
    execFileSync(png2icnsBin, [icnsPath, ...tmpFiles], { stdio: 'inherit' });
    await fs.rm(tmpDir, { recursive: true });
    console.log('  icon.icns generated (png2icns / libicns)');
  } else {
    console.warn(
      '  Neither iconutil nor png2icns found — skipping icon.icns (Mac builds will fall back to .png).' +
        '\n    Install: macOS ships iconutil; Linux: apt-get install icnsutils',
    );
  }

  // .ico (Windows) -- ImageMagick v7 ships `magick`; Ubuntu 24.04 still
  // ships v6 with `convert`. Both produce identical .ico output for our
  // input set; the v6 syntax is `convert inputs output`.
  const icoPath = path.join(electronBuild, 'icon.ico');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const inputFiles = sizes.map((s) => path.join(BUILD, `${s}.png`));
  // Resolve magick (IM v7) or fall back to convert (IM v6). Both
  // produce the same .ico output for our input set.
  const magickBin = resolveOnSafePath('magick') || resolveOnSafePath('convert');
  if (magickBin) {
    execFileSync(magickBin, [...inputFiles, icoPath], { stdio: 'inherit' });
    console.log(`  icon.ico generated (${path.basename(magickBin)})`);
  } else {
    console.warn(
      '  ImageMagick (magick / convert) not found — skipping icon.ico (Windows builds will fall back to .png).' +
        '\n    Install: macOS `brew install imagemagick`; Linux `apt-get install imagemagick`',
    );
  }

  // ---- Android mipmap icons ----
  // Android uses density-suffixed dirs: mipmap-mdpi (1x = 48), -hdpi (1.5x = 72),
  // -xhdpi (2x = 96), -xxhdpi (3x = 144), -xxxhdpi (4x = 192).
  // For each density we ship: ic_launcher (square), ic_launcher_round (round),
  // ic_launcher_foreground (adaptive icon foreground -- full color, square).
  const androidRoot = path.join(ROOT, 'ui/android/app/src/main/res');
  if (
    await fs
      .access(androidRoot)
      .then(() => true)
      .catch(() => false)
  ) {
    console.log('Building Android mipmap icons...');
    const ANDROID_DENSITIES = [
      { dir: 'mipmap-mdpi', size: 48 },
      { dir: 'mipmap-hdpi', size: 72 },
      { dir: 'mipmap-xhdpi', size: 96 },
      { dir: 'mipmap-xxhdpi', size: 144 },
      { dir: 'mipmap-xxxhdpi', size: 192 },
    ];
    for (const d of ANDROID_DENSITIES) {
      const ddir = path.join(androidRoot, d.dir);
      await fs.mkdir(ddir, { recursive: true });
      await renderAtSize(sharp, svgBuffer, d.size, path.join(ddir, 'ic_launcher.png'));
      await renderAtSize(sharp, svgBuffer, d.size, path.join(ddir, 'ic_launcher_round.png'));
      // Adaptive icon foreground -- Android letterboxes/masks it, so render
      // at 108dp×108dp at the appropriate density. The safe zone is 66dp
      // centered, so we render the full SVG at the safe size and inset.
      const adaptiveSize = Math.round((d.size * 108) / 48);
      await renderAtSize(
        sharp,
        svgBuffer,
        adaptiveSize,
        path.join(ddir, 'ic_launcher_foreground.png'),
      );
    }
    console.log(`  Android mipmap × ${ANDROID_DENSITIES.length} densities (×3 variants each)`);
  }

  // ---- Web manifest icons ----
  // Filenames use BRAND_NAME (loaded from branding/brand.json) so a
  // rebrand auto-updates every reference: app.html, manifest.webmanifest,
  // canonicalOutputs above. Single source of truth for the filename.
  console.log('Building web manifest icons...');
  const webDir = path.join(ROOT, 'ui/static/icons');
  // Prune manifest icons left by a previous brand name (e.g. career-ops-192.png
  // after the rename to heron). generate-icons never deleted old-prefix files,
  // so the ui/static/icons/** turbo output glob cached + restored the orphans
  // on every //#brand cache hit. Drop any manifest-size icon whose prefix is
  // not the current brand, then render the current set.
  try {
    for (const f of await fs.readdir(webDir)) {
      const m = f.match(/^(.+)-(?:192|256|384|512)\.png$/);
      if (m && m[1] !== BRAND_NAME) await fs.rm(path.join(webDir, f));
    }
  } catch {
    // dir absent on a fresh tree -- ensureDirs created it, so this is best-effort
  }
  for (const s of [192, 256, 384, 512]) {
    await renderAtSize(sharp, svgBuffer, s, path.join(webDir, `${BRAND_NAME}-${s}.png`));
  }
  console.log(`  4 web manifest sizes rendered (prefix=${BRAND_NAME})`);

  // ---- watchOS icon ----
  // The Watch target's AppIcon.appiconset expects a single 1024x1024
  // image at `AppIcon-1024.png`. Xcode auto-derives the smaller sizes
  // (24/27.5/29/33/40/44/50/51/54/86/98/108/117/129/172/196/216/234/258)
  // from this master at build time.
  const watchIconDir = path.join(ROOT, 'ui/ios/App/WatchApp/Assets.xcassets/AppIcon.appiconset');
  try {
    const exists = await fs
      .access(watchIconDir)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      await renderAtSize(sharp, svgBuffer, 1024, path.join(watchIconDir, 'AppIcon-1024.png'), true);
      console.log('  watchOS AppIcon-1024.png rendered');
    }
  } catch {
    /* watch target not present yet -- skip */
  }

  // ---- favicon.ico ----
  // Browsers and some search engines request `/favicon.ico` even when
  // a higher-resolution `<link rel="icon">` is declared. We ship a
  // multi-size .ico (16/32/48) so legacy clients render correctly.
  // ImageMagick if present, png-to-ico fallback otherwise.
  console.log('Building /favicon.ico...');
  const staticDir = path.join(ROOT, 'ui/static');
  const faviconIco = path.join(staticDir, 'favicon.ico');
  // Resolve magick via the safe-PATH allowlist (CodeQL `js/shell-command-
  // injection-from-environment`-clean) and pass argv directly so a
  // tainted BUILD dir can't smuggle shell metachars in.
  const faviconMagickBin = resolveOnSafePath('magick');
  let faviconBuilt = false;
  if (faviconMagickBin) {
    try {
      const inputs = [16, 32, 48].map((s) => path.join(BUILD, `${s}.png`));
      execFileSync(faviconMagickBin, [...inputs, faviconIco], { stdio: 'inherit' });
      console.log('  favicon.ico generated (multi-size via ImageMagick)');
      faviconBuilt = true;
    } catch (e) {
      console.warn(`  magick favicon.ico generation failed: ${e.message}`);
    }
  }
  if (!faviconBuilt) {
    // Fallback: write a single-size 32x32 PNG masquerading as .ico --
    // browsers accept this gracefully. ImageMagick is the right way
    // to build a true ICO container.
    try {
      await fs.copyFile(path.join(BUILD, '32.png'), faviconIco);
      console.log(
        '  favicon.ico generated (32x32 PNG fallback — install ImageMagick for multi-size)',
      );
    } catch (e) {
      console.warn(`  favicon.ico fallback failed: ${e.message}`);
    }
  }

  await writeCacheKey(key);
  console.log('\n✓ All icons generated');
}

// Run only when executed directly (apply-brand spawns this as a subprocess, and
// the CLI invokes it by path). Importing the module -- e.g. from the unit test
// for `scaleSvgImage` -- must NOT trigger a full icon render.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
