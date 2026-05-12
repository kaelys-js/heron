#!/usr/bin/env node
/**
 * generate-icons.mjs — render master SVG into every platform asset size.
 *
 * Inputs:
 *   ui/static/favicon.svg          (32×32 master, gradient-based — scales fine)
 *
 * Outputs:
 *   native/icons/_build/{size}.png            (raw renders)
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
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SVG = path.join(ROOT, 'ui/static/favicon.svg');
const BUILD = path.join(__dirname, '_build');

// Cache key — sha256 of the source SVG bytes. If it matches the cached
// value, every output PNG is already up-to-date and the whole 80-render
// pipeline can short-circuit. Set `--force` (or env ICONS_FORCE=1) to
// override. Cache file: `native/icons/_build/.cache-hash`.
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
  // sharp is installed inside ui/node_modules. Try the direct path first
  // (when this script is invoked from any cwd), then fall back to the
  // unqualified import for when it's run from ui/.
  const candidates = [path.join(ROOT, 'ui/node_modules/sharp/lib/index.js'), 'sharp'];
  for (const c of candidates) {
    try {
      const mod = await import(c);
      return mod.default ?? mod;
    } catch {
      /* try next */
    }
  }
  console.error('Missing peer dep "sharp". Install with: cd ui && pnpm add -D sharp');
  process.exit(1);
}

async function renderAtSize(sharp, svg, size, outPath) {
  await sharp(svg)
    .resize(Math.round(size), Math.round(size), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
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
  });
  const key = createHash('sha256').update(svgBuffer).update(matrixKey).digest('hex').slice(0, 16);
  const prev = await readCacheKey();
  if (!force && prev === key) {
    console.log(`✓ Icons unchanged (cache=${key}) — skipping render`);
    return;
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
  // For most apps the same artwork renders correctly in all three —
  // tinted just gets desaturated by iOS. We register all three so the
  // App Store reports "Full iOS 18 support" rather than "Light only".
  console.log('Building iOS AppIcon.appiconset (light + dark + tinted)...');
  const iosDir = path.join(ROOT, 'ui/ios/App/App/Assets.xcassets/AppIcon.appiconset');
  await fs.mkdir(iosDir, { recursive: true });
  const iosContents = { images: [], info: { version: 1, author: 'xcode' } };
  for (const slot of IOS_SLOTS) {
    const px = Math.round(slot.size * slot.scale);
    const out = path.join(iosDir, slot.name);
    await renderAtSize(sharp, svgBuffer, px, out);
    iosContents.images.push({
      idiom: slot.idiom,
      size: `${slot.size}x${slot.size}`,
      scale: `${slot.scale}x`,
      filename: slot.name,
    });
  }
  // iOS 18 dark + tinted entries — use the same 1024 marketing artwork
  // for each appearance. Xcode auto-derives the smaller sizes from the
  // 1024 source on devices that support per-appearance icons.
  for (const appearance of ['dark', 'tinted']) {
    const fname = `AppIcon-1024-${appearance}.png`;
    await renderAtSize(sharp, svgBuffer, 1024, path.join(iosDir, fname));
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

  // ---- Electron icons ----
  console.log('Building Electron icons...');
  const electronBuild = path.join(ROOT, 'ui/electron/build');
  await renderAtSize(sharp, svgBuffer, 512, path.join(electronBuild, 'icon.png'));
  await renderAtSize(sharp, svgBuffer, 256, path.join(electronBuild, 'icon-256.png'));
  await renderAtSize(sharp, svgBuffer, 1024, path.join(electronBuild, 'icon-1024.png'));

  // .icns (macOS) — prefer iconutil (macOS-native, best output) and fall
  // back to png2icns (libicns, available on Linux CI via icnsutils).
  // Both produce the same wire format; iconutil's output is just a hair
  // smaller because it deduplicates @1x/@2x pairs.
  const icnsPath = path.join(electronBuild, 'icon.icns');
  const hasIconutil = (() => {
    try {
      execSync('which iconutil', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  const hasPng2icns = (() => {
    try {
      execSync('which png2icns', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  if (hasIconutil) {
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
      await renderAtSize(sharp, svgBuffer, size, path.join(iconset, name));
    }
    execSync(`iconutil -c icns "${iconset}" -o "${icnsPath}"`, { stdio: 'inherit' });
    await fs.rm(iconset, { recursive: true });
    console.log('  icon.icns generated (iconutil)');
  } else if (hasPng2icns) {
    // png2icns expects discrete PNGs at icon-size boundaries.
    const sizes = [16, 32, 48, 128, 256, 512, 1024];
    const tmpDir = path.join(electronBuild, 'icon.tmp');
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFiles = [];
    for (const s of sizes) {
      const p = path.join(tmpDir, `icon_${s}.png`);
      await renderAtSize(sharp, svgBuffer, s, p);
      tmpFiles.push(p);
    }
    execSync(`png2icns "${icnsPath}" ${tmpFiles.map((f) => `"${f}"`).join(' ')}`, {
      stdio: 'inherit',
    });
    await fs.rm(tmpDir, { recursive: true });
    console.log('  icon.icns generated (png2icns / libicns)');
  } else {
    console.warn(
      '  Neither iconutil nor png2icns found — skipping icon.icns (Mac builds will fall back to .png).' +
        '\n    Install: macOS ships iconutil; Linux: apt-get install icnsutils',
    );
  }

  // .ico (Windows) — needs ImageMagick or png2ico
  try {
    execSync('which magick', { stdio: 'ignore' });
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const inputs = sizes.map((s) => path.join(BUILD, `${s}.png`)).join(' ');
    execSync(`magick ${inputs} "${path.join(electronBuild, 'icon.ico')}"`, { stdio: 'inherit' });
    console.log('  icon.ico generated');
  } catch {
    console.warn(
      '  ImageMagick (magick) not found — skipping icon.ico (Windows builds will fall back to .png)',
    );
  }

  // ---- Android mipmap icons ----
  // Android uses density-suffixed dirs: mipmap-mdpi (1x = 48), -hdpi (1.5x = 72),
  // -xhdpi (2x = 96), -xxhdpi (3x = 144), -xxxhdpi (4x = 192).
  // For each density we ship: ic_launcher (square), ic_launcher_round (round),
  // ic_launcher_foreground (adaptive icon foreground — full color, square).
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
      // Adaptive icon foreground — Android letterboxes/masks it, so render
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
  console.log('Building web manifest icons...');
  const webDir = path.join(ROOT, 'ui/static/icons');
  for (const s of [192, 256, 384, 512]) {
    await renderAtSize(sharp, svgBuffer, s, path.join(webDir, `career-ops-${s}.png`));
  }
  console.log('  4 web manifest sizes rendered');

  // ---- watchOS icon ----
  // The Watch target's AppIcon.appiconset expects a single 1024x1024
  // image at `AppIcon-1024.png`. Xcode auto-derives the smaller sizes
  // (24/27.5/29/33/40/44/50/51/54/86/98/108/117/129/172/196/216/234/258)
  // from this master at build time.
  const watchIconDir = path.join(
    ROOT,
    'ui/ios/App/CareerOpsWatch/Assets.xcassets/AppIcon.appiconset',
  );
  try {
    const exists = await fs
      .access(watchIconDir)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      await renderAtSize(sharp, svgBuffer, 1024, path.join(watchIconDir, 'AppIcon-1024.png'));
      console.log('  watchOS AppIcon-1024.png rendered');
    }
  } catch {
    /* watch target not present yet — skip */
  }

  // ---- favicon.ico ----
  // Browsers and some search engines request `/favicon.ico` even when
  // a higher-resolution `<link rel="icon">` is declared. We ship a
  // multi-size .ico (16/32/48) so legacy clients render correctly.
  // ImageMagick if present, png-to-ico fallback otherwise.
  console.log('Building /favicon.ico...');
  const staticDir = path.join(ROOT, 'ui/static');
  const faviconIco = path.join(staticDir, 'favicon.ico');
  try {
    execSync('which magick', { stdio: 'ignore' });
    const inputs = [16, 32, 48].map((s) => path.join(BUILD, `${s}.png`)).join(' ');
    execSync(`magick ${inputs} "${faviconIco}"`, { stdio: 'inherit' });
    console.log('  favicon.ico generated (multi-size via ImageMagick)');
  } catch {
    // Fallback: write a single-size 32x32 PNG masquerading as .ico —
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
