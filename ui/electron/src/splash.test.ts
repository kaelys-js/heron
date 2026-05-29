import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSplashHtml } from './splash';
// The single source. splash.ts is GENERATED from this by apply-brand, so the
// strongest guard is "what splash.ts ships === what the spec emits today".
import {
  buildSplashHtml as specBuildSplashHtml,
  loadBrandSource,
} from '../../../scripts/native/splash-spec.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { colors, mascot } = loadBrandSource(ROOT);

describe('electron splash.ts', () => {
  const html = buildSplashHtml();

  it('matches splash-spec.mjs exactly (regenerate with `pnpm brand:apply`)', () => {
    expect(html).toBe(
      specBuildSplashHtml({
        colors,
        splashBg: mascot.splashBg,
        mascotDataUri: mascot.heroWebp,
        animated: true,
      }),
    );
  });

  it('renders the composition: solid bg + mascot + arc loader', () => {
    for (const cls of ['splash-bg', 'splash-mark', 'splash-arc']) {
      expect(html, `splash should include .${cls}`).toContain(cls);
    }
  });

  it('uses the SOLID mascot-sampled background (no bloom/glow/grain)', () => {
    expect(mascot.splashBg).toMatch(/^#[0-9a-f]{6}$/);
    expect(html).toContain(`background: ${mascot.splashBg}`);
    expect(html).not.toContain('radial-gradient');
    expect(html).not.toContain('feTurbulence');
  });

  it('renders the MASCOT image + the existing dawn-gold arc loader', () => {
    expect(html).toContain('class="splash-mark-img"');
    expect(html).toContain('data:image/webp;base64,');
    expect(html).not.toContain('pathLength'); // no vector-glyph remnants
    expect(html).toContain('stroke-dasharray="52 88"'); // arc loader
  });

  it('sizes the mascot in viewport units', () => {
    expect(html).toContain('clamp(120px, 28vh, 280px)');
  });

  it('bounces the mascot, and collapses to a still frame under reduced-motion', () => {
    expect(html).toContain('@keyframes splash-bounce');
    expect(html).toContain('@keyframes splash-bob');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
