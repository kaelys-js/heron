#!/usr/bin/env node
/**
 * visual-regression.mjs -- local Lost Pixel runner.
 *
 * Boots `vite preview` against the freshly-built static bundle, runs
 * `lost-pixel`, then tears the server down. Same flow the CI workflow
 * `.github/workflows/visual-regression.yml` uses, so a local
 * `pnpm visual:diff` produces the same output as a CI run.
 *
 * Modes:
 *
 *   --generate   Generate fresh baselines (overwrites .lostpixel/baseline/*)
 *                Use for the first baseline run + after legitimate UI changes
 *                (or label the PR `accept-snapshots` to do this in CI).
 *
 *   --compare    Compare current snapshots vs .lostpixel/baseline/*.
 *                Exit non-zero on any pixel diff > threshold (10%).
 *
 * Usage:
 *
 *   pnpm visual:baseline      # generate
 *   pnpm visual:diff          # compare
 *   pnpm visual:diff --open   # opens .lostpixel/difference/ on diff
 *
 * Pre-reqs: pnpm install (Chromium auto-installed by lost-pixel).
 */
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const MODE = process.argv.includes('--generate') ? 'generate' : 'compare';
const OPEN_ON_DIFF = process.argv.includes('--open');

function probe(url, attempts) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch {
        /* not ready yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    resolve(false);
  });
}

async function main() {
  console.log(`🎨  Visual regression — mode: ${MODE}`);

  // Build the UI first (lost-pixel needs the prod artifacts under
  // ui/build/client/).
  console.log('▸ Building ui (turbo cache will short-circuit if warm)…');
  execFileSync('pnpm', ['--filter', 'ui', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // Boot vite preview in the background.
  console.log('▸ Starting vite preview on :4173…');
  const preview = spawn('pnpm', ['--filter', 'ui', 'exec', 'vite', 'preview', '--port', '4173'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ready = await probe('http://localhost:4173/login', 30);
  if (!ready) {
    preview.kill('SIGTERM');
    console.error('::error::vite preview never became responsive');
    process.exit(2);
  }
  console.log('✓ vite preview ready at http://localhost:4173');

  try {
    const env = {
      ...process.env,
      LOST_PIXEL_MODE: MODE === 'generate' ? 'generate-only' : 'compare',
    };
    execFileSync('pnpm', ['dlx', 'lost-pixel@v3.22.0'], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    });
    console.log(`\n✓ ${MODE === 'generate' ? 'Baselines generated' : 'No visual regressions'}.`);
  } catch (err) {
    console.error(`\n✗ ${MODE === 'generate' ? 'Baseline generation' : 'Visual diff'} failed.`);
    if (MODE === 'compare' && OPEN_ON_DIFF) {
      try {
        execFileSync('open', [path.join(ROOT, '.lostpixel', 'difference')], { stdio: 'ignore' });
      } catch {
        /* macOS only -- silently skip */
      }
    }
    if (MODE === 'compare') {
      console.error(
        '\nIf the diff is intentional, regenerate baselines with:\n  pnpm visual:baseline\n',
      );
    }
    process.exitCode = 1;
  } finally {
    preview.kill('SIGTERM');
    // Give it a moment to clean up
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((err) => {
  console.error('::error::visual-regression failed:', err.message || err);
  process.exit(1);
});
