import { readFileSync } from 'node:fs';
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
// apply-brand inlines the shared particle bundle into the Electron splash (a
// data: URL can't fetch it), so the spec call must inline the same bytes to match.
const particlesScript = readFileSync(resolve(ROOT, 'ui/static/heron-particles.js'), 'utf8');

describe('electron splash.ts', () => {
  const html = buildSplashHtml();

  it('matches splash-spec.mjs exactly (regenerate with `pnpm brand:apply`)', () => {
    expect(html).toBe(
      specBuildSplashHtml({
        colors,
        splashBg: mascot.splashBg,
        mascotDataUri: mascot.heroWebp,
        animated: true,
        particlesScript,
      }),
    );
  });

  it('renders the composition: sampled bg + vignette + grain + mascot + arc', () => {
    for (const cls of [
      'splash-bg',
      'splash-vignette',
      'splash-grain',
      'splash-mark',
      'splash-arc',
    ]) {
      expect(html, `splash should include .${cls}`).toContain(cls);
    }
  });

  it('builds on the mascot-sampled background with a vignette + film grain', () => {
    expect(mascot.splashBg).toMatch(/^#[0-9a-f]{6}$/);
    expect(html).toContain(`background: ${mascot.splashBg}`); // sampled-blue base
    expect(html).toContain('radial-gradient'); // vignette
    expect(html).toContain('feTurbulence'); // film grain
    // Bare mascot: no squircle tile, no login/signup dawn-sky bloom.
    expect(html).not.toContain('rx="232"');
    expect(html).not.toContain('#090b0f');
  });

  it('renders the BARE MASCOT image + the existing dawn-gold arc loader', () => {
    expect(html).toContain('class="splash-mark-img"');
    expect(html).toContain('data:image/webp;base64,');
    expect(html).not.toContain('pathLength'); // no vector-glyph remnants
    expect(html).toContain('stroke-dasharray="52 88"'); // arc loader
  });

  it('sizes the mascot small + centered, like the home-screen icon', () => {
    expect(html).toContain('clamp(80px, max(11vh, 11vw), 200px)');
  });

  it('bounces the mascot, and collapses to a still frame under reduced-motion', () => {
    expect(html).toContain('@keyframes splash-bounce');
    expect(html).toContain('@keyframes splash-rebounce');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
