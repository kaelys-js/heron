#!/usr/bin/env node
/**
 * Bundle the shared particle runtime (tsParticles slim + the dawn-motes config +
 * the mount logic) into ui/static/heron-particles.js -- the ONE bundle every
 * surface loads: the SvelteKit pages (via Particles.svelte), the app.html
 * boot-fallback splash (async <script>), and the Electron splash (apply-brand
 * inlines it). Re-run after changing the particle config or brand colours.
 *
 * esbuild is resolved from ui's dependency tree (it ships with Vite).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'ui', 'package.json'));
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: [join(ROOT, 'ui', 'src', 'lib', 'particles', 'entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020', 'safari16'],
  minify: true,
  legalComments: 'none',
  outfile: join(ROOT, 'ui', 'static', 'heron-particles.js'),
});

console.log('✓ ui/static/heron-particles.js built');
