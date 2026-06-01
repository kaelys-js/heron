/**
 * "Dawn motes" -- the single tsParticles config for the brand particle effect,
 * used identically on every surface (login/signup + loading/dev via
 * BloomBackground, and the splash screens via the bundled static script).
 *
 * Built on the verified-premium recipe (tsParticles official `stars` preset +
 * `snow`/`ambient` principles), researched 2026-05:
 *   - independent per-mote opacity TWINKLE: opacity {min:0} animated, sync:false
 *     (NOT size.animation, NOT a twinkle plugin -- those don't do what's wanted)
 *   - barely-perceptible slow UNDIRECTED drift (stars: speed 0.1, direction
 *     none, random, straight:false, outModes:out)
 *   - randomized SIZE for depth; zIndex depth range (parallax); WOBBLE for
 *     organic side-to-side sway
 *   - NO links (the cheesy "network" lines); restrained two-tone gold/cream
 *     palette with reed-green used sparingly
 * Colours come from the brand palette (relative import so it resolves under both
 * Vite and the standalone esbuild bundle).
 *
 * Sources: tsParticles presets -- stars/src/options.ts, snow/src/options.ts.
 */
import type { ISourceOptions } from '@tsparticles/engine';
import { BRAND } from '../client/brand';

const GOLD = BRAND.colors.accent; // #c89b4a -- Heron Dawn
const REED = BRAND.colors.accentSecondary; // #7a8c6d -- Heron Reed
const CREAM = '#e8d6a8'; // soft warm cream (a light tint of the dawn gold)

export type Zone = 'top-right' | 'bottom';

export function heronParticleOptions(zone: Zone, count: number): ISourceOptions {
  const rising = zone === 'bottom'; // bottom band: motes drift gently UP, like dawn dust
  return {
    fullScreen: { enable: false },
    detectRetina: true,
    fpsLimit: 60,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
    particles: {
      number: { value: count },
      // gold + cream dominate; reed ~1 in 5 (array is sampled uniformly).
      color: { value: [GOLD, CREAM, GOLD, CREAM, REED] },
      shape: { type: 'circle' },
      size: { value: rising ? { min: 1, max: 3 } : { min: 2, max: 4 } },
      // The twinkle: each mote fades 0→max on an independent phase (sync:false).
      opacity: {
        value: { min: 0, max: 0.6 },
        animation: { enable: true, speed: 1, sync: false },
      },
      move: {
        enable: true,
        speed: rising ? 0.1 : 0.12,
        direction: rising ? 'top' : 'none',
        random: true,
        straight: false,
        outModes: { default: 'out' },
      },
      // Parallax depth: lower-z motes render slower/smaller/more transparent.
      zIndex: { value: { min: 0, max: 100 } },
      // Organic side-to-side sway (needs @tsparticles/updater-wobble).
      wobble: { enable: true, distance: 8, speed: { min: -2, max: 2 } },
      // Soft glow so motes read as light, not hard dots.
      shadow: { enable: true, color: GOLD, blur: 6 },
    },
  };
}
