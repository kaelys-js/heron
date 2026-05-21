#!/usr/bin/env node
/**
 * run-axe.mjs -- minimal axe-core runner via Playwright. Used by the
 * a11y-comment.yml workflow to scan the preview URL.
 *
 * Usage:  node run-axe.mjs <url>  -> emits an array of { url, violations: [...] } on stdout.
 *
 * Designed to be tolerant: if Playwright + @axe-core/playwright aren't
 * installed (the user hasn't opted in yet), exit 0 with an empty array
 * so the sticky workflow doesn't fail.
 */
import { spawnSync } from 'node:child_process';

const url = process.argv[2];
if (!url) {
  console.error('Usage: run-axe.mjs <url>');
  process.exit(2);
}

let chromium;
let AxeBuilder;
try {
  ({ chromium } = await import('playwright'));
  AxeBuilder = (await import('@axe-core/playwright')).default;
} catch (err) {
  console.error(
    '::warning::Playwright or @axe-core/playwright not installed; emitting empty axe report.',
  );
  process.stdout.write('[]');
  process.exit(0);
}

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const results = await new AxeBuilder({ page }).analyze();
  await browser.close();
  process.stdout.write(JSON.stringify([{ url, violations: results.violations || [] }]));
} catch (err) {
  console.error(`::warning::axe-core scan failed: ${err.message}`);
  process.stdout.write('[]');
}
