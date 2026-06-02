#!/usr/bin/env node
/**
 * verify-splash-sync -- fail if any launch/boot surface has drifted from the
 * single-source splash spec (scripts/native/splash-spec.mjs).
 *
 * The splash (solid mascot-sampled bg + centered mascot + arc loader) is
 * generated into every surface by `pnpm brand:apply` (+ `pnpm icons` for the iOS
 * PNG). This guard proves the generated copies still match the spec, so editing
 * splash-spec.mjs without re-running the generators -- or hand-editing a
 * generated block -- red-bars CI instead of shipping a half-updated splash.
 *
 * Checks (whitespace-normalised so prettier/biome layout can't false-positive):
 *   - the SPLASH surfaces (app.html #boot-fallback, electron/splash.ts) use the
 *     mascot-sampled `splashBg` + vignette + grain + mark + arc + splash keyframes
 *   - login + signup keep the dawn-sky bloom (their separate treatment)
 *   - LaunchScreen.storyboard's launch bg == `splashBg`
 *
 * Run: `pnpm verify:splash-sync` (also part of `pnpm verify`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadBrandSource,
  bloomLayers,
  bloomLayersLight,
  bloomGrainStyle,
} from '../native/splash-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => p.replace(ROOT + '/', '');
const norm = (s) => s.replace(/\s+/g, ' ');
const read = (p) => {
  try {
    return readFileSync(join(ROOT, p), 'utf8');
  } catch {
    return null;
  }
};

const { colors, mascot } = loadBrandSource(ROOT);
const splashBg = mascot.splashBg;
const errors = [];

// 1. The SPLASH surfaces use the solid mascot-sampled bg + mark + arc + keyframes.
for (const p of ['ui/src/app.html', 'ui/electron/src/splash.ts']) {
  const content = read(p);
  if (content == null) {
    errors.push(`${p}: missing (cannot verify splash)`);
    continue;
  }
  const n = norm(content);
  for (const token of [
    `background: ${splashBg}`,
    'splash-vignette',
    'splash-grain',
    'splash-mark',
    'splash-arc',
    '@keyframes splash-',
  ]) {
    if (!n.includes(norm(token))) {
      errors.push(`${rel(p)}: missing "${token}" — run \`pnpm brand:apply\``);
    }
  }
}

// 2. The centralized BloomBackground carries the dawn-sky bloom -- the dark AND
//    light layer sets plus the grain overlay must all be present; login + signup
//    render <BloomBackground /> rather than inlining it.
const layers = [...bloomLayers(colors), ...bloomLayersLight(colors), bloomGrainStyle()].map(norm);
const bloomFile = 'ui/src/lib/components/BloomBackground.svelte';
const bloomContent = norm(read(bloomFile) ?? '');
for (const layer of layers) {
  if (!bloomContent.includes(layer)) {
    errors.push(
      `${rel(bloomFile)}: stale/absent bloom layer — run \`pnpm brand:apply\`\n    expected: ${layer}`,
    );
  }
}
for (const p of ['ui/src/routes/login/+page.svelte', 'ui/src/routes/signup/+page.svelte']) {
  if (!norm(read(p) ?? '').includes('<BloomBackground')) {
    errors.push(`${rel(p)}: should render <BloomBackground /> (centralized bloom)`);
  }
}

// 3. iOS launch storyboard bg == splashBg (matches the Splash.imageset PNG).
const sb = read('ui/ios/App/App/Base.lproj/LaunchScreen.storyboard');
const m = /^#?([0-9a-fA-F]{6})$/.exec(splashBg);
// Fail closed: a missing storyboard or an unparseable splashBg must be a hard
// error, not a silent skip that lets the verifier go green without checking.
if (sb == null) {
  errors.push(
    'ui/ios/App/App/Base.lproj/LaunchScreen.storyboard: missing or unreadable (cannot verify launch bg)',
  );
} else if (!m) {
  errors.push(`splashBg is not a valid 6-hex color (got "${splashBg}")`);
} else {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const want = `red="${r}" green="${g}" blue="${b}"`;
  if (!norm(sb).includes(want)) {
    errors.push(
      `LaunchScreen.storyboard: launch bg != splashBg (${splashBg}) — run \`pnpm brand:apply\`\n    expected: ${want}`,
    );
  }
}

if (errors.length) {
  console.error('✗ splash drift detected:\n');
  for (const e of errors) console.error('  - ' + e);
  console.error('\nThe splash is single-sourced in scripts/native/splash-spec.mjs.');
  console.error('Edit THAT, then run `pnpm brand:apply && pnpm icons`.');
  process.exit(1);
}
console.log('✓ splash in sync across app.html, electron, login/signup, storyboard');
