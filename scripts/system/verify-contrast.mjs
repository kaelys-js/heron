#!/usr/bin/env node
// verify-contrast -- WCAG 2.x AA guard for the brand token palette.
//
// Reads branding/brand.json and asserts every FUNCTIONAL foreground/background
// token pair clears AA in BOTH light and dark: 4.5:1 for text, 3.0:1 for
// non-text UI affordances (focus ring, input outline). Exits non-zero on any
// failure so brand:apply / CI can never ship an inaccessible palette.
//
// WHY pairs, not every permutation: a token is only an a11y problem against the
// surfaces it actually paints on. We encode the real usages (text on
// page/card/surface, label on fill, focus ring vs surface, field outline vs
// surface) -- the same matrix the audit used.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const brand = JSON.parse(readFileSync(join(ROOT, 'branding', 'brand.json'), 'utf8'));

function lum(hex) {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = ch.map((cs) => (cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
const ratio = (a, b) => {
  const la = lum(a),
    lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// [foregroundToken, backgroundToken, minRatio, label]
const PAIRS = [
  ['foreground', 'background', 4.5, 'body text on page'],
  ['cardForeground', 'card', 4.5, 'card text'],
  ['popoverForeground', 'popover', 4.5, 'popover/menu text'],
  ['mutedForeground', 'muted', 4.5, 'muted text on muted surface'],
  ['mutedForeground', 'background', 4.5, 'muted text on page'],
  ['primaryForeground', 'primary', 4.5, 'primary button label'],
  ['secondaryForeground', 'secondary', 4.5, 'secondary button label'],
  ['accentForeground', 'accent', 4.5, 'text on gold fill'],
  ['accentSecondaryForeground', 'accentSecondary', 4.5, 'text on reed fill'],
  ['destructiveForeground', 'destructive', 4.5, 'destructive label (fill)'],
  ['destructive', 'background', 4.5, 'destructive AS TEXT on page'],
  ['destructive', 'card', 4.5, 'destructive AS TEXT on card'],
  ['sidebarForeground', 'sidebar', 4.5, 'sidebar text'],
  ['sidebarAccentForeground', 'sidebarAccent', 4.5, 'sidebar active-item text'],
  ['sidebarPrimaryForeground', 'sidebarPrimary', 4.5, 'sidebar primary label'],
  // accent-strong = the on-surface text/icon variant of the accents:
  ['accentStrong', 'background', 4.5, 'accent-strong text/icon on page'],
  ['accentStrong', 'card', 4.5, 'accent-strong text/icon on card'],
  ['accentSecondaryStrong', 'background', 4.5, 'accent-secondary-strong text on page'],
  ['accentSecondaryStrong', 'card', 4.5, 'accent-secondary-strong text on card'],
  // status colors used as TEXT (tinted badge ~= surface) + as solid fills:
  ['success', 'background', 4.5, 'success text on page'],
  ['success', 'card', 4.5, 'success text on card'],
  ['successForeground', 'success', 4.5, 'text on solid success'],
  ['warning', 'background', 4.5, 'warning text on page'],
  ['warning', 'card', 4.5, 'warning text on card'],
  ['warningForeground', 'warning', 4.5, 'text on solid warning'],
  ['info', 'background', 4.5, 'info text on page'],
  ['info', 'card', 4.5, 'info text on card'],
  ['infoForeground', 'info', 4.5, 'text on solid info'],
  // non-text UI affordances (WCAG 1.4.11, 3:1):
  ['ring', 'background', 3.0, 'focus ring vs page'],
  ['ring', 'card', 3.0, 'focus ring vs card'],
  ['input', 'card', 3.0, 'input outline vs card'],
  ['input', 'background', 3.0, 'input outline vs page'],
];

let failures = 0;
for (const mode of ['light', 'dark']) {
  const t = brand.colors.tokens[mode];
  for (const [fg, bg, need, label] of PAIRS) {
    const a = t[fg],
      b = t[bg];
    if (!a || !b) {
      failures++;
      console.error(`MISSING [${mode}] ${fg} or ${bg} -- ${label}`);
      continue;
    }
    const r = ratio(a, b);
    if (r < need) {
      failures++;
      console.error(
        `FAIL [${mode}] ${r.toFixed(2)}:1 < ${need}  ${label}  (${fg} ${a} / ${bg} ${b})`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\nverify-contrast: ${failures} WCAG-AA failure(s). Fix branding/brand.json.`);
  process.exit(1);
}
console.log('verify-contrast: all brand token pairs clear WCAG AA in light + dark.');
