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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SVG = path.join(ROOT, 'ui/static/favicon.svg');
const BUILD = path.join(__dirname, '_build');

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

async function main() {
  await ensureDirs();
  const sharp = await loadSharp();
  const svgBuffer = await fs.readFile(SVG);

  console.log('Rendering raw sizes...');
  for (const s of SIZES) {
    const out = path.join(BUILD, `${s}.png`);
    await renderAtSize(sharp, svgBuffer, s, out);
  }
  console.log(`  ${SIZES.length} PNG sizes rendered`);

  // ---- iOS AppIcon.appiconset ----
  console.log('Building iOS AppIcon.appiconset...');
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
  await fs.writeFile(path.join(iosDir, 'Contents.json'), JSON.stringify(iosContents, null, 2));
  console.log(`  ${IOS_SLOTS.length} iOS slots + Contents.json`);

  // ---- Electron icons ----
  console.log('Building Electron icons...');
  const electronBuild = path.join(ROOT, 'ui/electron/build');
  await renderAtSize(sharp, svgBuffer, 512, path.join(electronBuild, 'icon.png'));
  await renderAtSize(sharp, svgBuffer, 256, path.join(electronBuild, 'icon-256.png'));
  await renderAtSize(sharp, svgBuffer, 1024, path.join(electronBuild, 'icon-1024.png'));

  // .icns (macOS) — only if iconutil exists
  try {
    execSync('which iconutil', { stdio: 'ignore' });
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
    execSync(`iconutil -c icns "${iconset}" -o "${path.join(electronBuild, 'icon.icns')}"`, {
      stdio: 'inherit',
    });
    await fs.rm(iconset, { recursive: true });
    console.log('  icon.icns generated');
  } catch {
    console.warn('  iconutil not found — skipping icon.icns (Mac builds will fall back to .png)');
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

  // ---- Web manifest icons ----
  console.log('Building web manifest icons...');
  const webDir = path.join(ROOT, 'ui/static/icons');
  for (const s of [192, 256, 384, 512]) {
    await renderAtSize(sharp, svgBuffer, s, path.join(webDir, `career-ops-${s}.png`));
  }
  console.log('  4 web manifest sizes rendered');

  console.log('\n✓ All icons generated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
