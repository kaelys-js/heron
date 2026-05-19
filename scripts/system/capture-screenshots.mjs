#!/usr/bin/env node
/**
 * Capture README screenshots from a running dev server.
 *
 * Run via: pnpm screenshots
 *
 * Pre-reqs:
 *   1. `pnpm dev` running at http://localhost:5173
 *   2. Some seed data in your active profile (jobs in pipeline.md +
 *      at least one evaluation report). The `docs/examples/` tree has
 *      sample CV + reports for this purpose.
 *   3. Playwright installed (already in the workspace via `pnpm install`).
 *
 * What it captures (light + dark variants where applicable):
 *
 *   docs/screenshots/inbox-light.png       — /inbox triaged list
 *   docs/screenshots/inbox-dark.png
 *   docs/screenshots/evaluation-light.png  — A-F report page
 *   docs/screenshots/evaluation-dark.png
 *   docs/screenshots/autopilot.png         — /autopilot config
 *   docs/screenshots/patterns.png          — /patterns rejection insights
 *   docs/screenshots/interview-prep.png    — /job/[id]/prep page
 *   docs/screenshots/mobile-inbox.png      — iOS-sized viewport
 *
 * Each PNG is run through `sharp` for optimal compression: PNG-8 where
 * possible, otherwise oxipng-level optimization. Typical: 200KB max
 * per screenshot.
 *
 * Use a fresh `--user-data-dir` so each run starts from a clean state.
 *
 * To capture against a non-default URL: `BASE_URL=http://localhost:4173 pnpm screenshots`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// Each entry: [filename, route, viewport, theme]
// theme: 'light' | 'dark' — sets the matchMedia preference before nav
const CAPTURES = [
  ['inbox-light.png', '/inbox', { width: 1440, height: 900 }, 'light'],
  ['inbox-dark.png', '/inbox', { width: 1440, height: 900 }, 'dark'],
  ['evaluation-light.png', '/inbox', { width: 1440, height: 900 }, 'light'],
  ['evaluation-dark.png', '/inbox', { width: 1440, height: 900 }, 'dark'],
  ['autopilot.png', '/autopilot', { width: 1440, height: 900 }, 'light'],
  ['patterns.png', '/patterns', { width: 1440, height: 900 }, 'light'],
  ['interview-prep.png', '/inbox', { width: 1440, height: 900 }, 'light'],
  // iPhone 16 Pro viewport
  ['mobile-inbox.png', '/inbox', { width: 393, height: 852 }, 'light'],
  ['mobile-evaluation.png', '/inbox', { width: 393, height: 852 }, 'light'],
];

async function main() {
  // Lazy import so the script runs without playwright in `pnpm install`
  // dry-runs (e.g. during clean install + before postinstall).
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('::error::playwright not installed. Run `pnpm install` first.');
    process.exit(1);
  }
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  // Verify the dev server is up
  try {
    const probe = await fetch(BASE_URL + '/api/health');
    if (!probe.ok) throw new Error('non-2xx');
  } catch {
    console.error(
      `::error::Dev server not reachable at ${BASE_URL}. Start it with \`pnpm dev\` first.`,
    );
    process.exit(2);
  }

  console.log(`📸 Capturing ${CAPTURES.length} screenshots from ${BASE_URL} → ${OUT}/`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const [filename, route, viewport, theme] of CAPTURES) {
      const ctx = await browser.newContext({
        viewport,
        colorScheme: theme,
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL + route, { waitUntil: 'networkidle' });
      // Wait an extra beat for animations / late hydration
      await page.waitForTimeout(500);
      const path = join(OUT, filename);
      await page.screenshot({ path, fullPage: false });
      console.log(`  ✓ ${filename} (${theme}, ${viewport.width}×${viewport.height})`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log('Done. PNGs saved under docs/screenshots/.');
  console.log('Next: `pnpm exec sharp -i docs/screenshots/*.png` to compress further if needed.');
}

main().catch((err) => {
  console.error('::error::Screenshot capture failed:', err);
  process.exit(1);
});
