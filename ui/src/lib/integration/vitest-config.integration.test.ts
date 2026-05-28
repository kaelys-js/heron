/**
 * Regression guard for vitest.config.ts (the project graph) configuration.
 *
 * Vitest 4's default `browser.headless` is `process.env.CI` -- locally
 * that's `undefined` → falsy → a real Chromium window pops every time
 * you run `pnpm test`. We explicitly set headless at the top-level
 * `browser` config (NOT inside the playwright() factory, which doesn't
 * propagate to the parent provider lookup). This test asserts the
 * explicit setting survives any refactor.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('vitest.config.ts headless gate', () => {
  const cfg = fs.readFileSync(path.join(REPO_ROOT, 'ui/vitest.config.ts'), 'utf8');

  it('declares browser.headless explicitly (no CI-env fallback drift)', () => {
    // Must contain the literal `headless: !process.env.BROWSER_HEAD`
    // inside the `browser:` block -- that's the only way to override
    // Vitest 4's `process.env.CI` default.
    expect(cfg).toMatch(/headless:\s*!process\.env\.BROWSER_HEAD/);
  });

  it('headless setting lives at browser-config level, not inside playwright() factory', () => {
    // Find the `browser: {` opening brace and assert `headless:` appears
    // before the `provider:` line. The playwright() factory's headless
    // option does NOT propagate to the parent -- only the top-level
    // browser.headless is read.
    const browserStart = cfg.indexOf('browser: {');
    const providerLine = cfg.indexOf('provider: playwright(', browserStart);
    const headlessLine = cfg.indexOf('headless:', browserStart);
    expect(browserStart).toBeGreaterThan(-1);
    expect(providerLine).toBeGreaterThan(-1);
    expect(headlessLine).toBeGreaterThan(-1);
    expect(headlessLine).toBeLessThan(providerLine);
  });

  it('comment explains the override (so future maintainers do not re-introduce the bug)', () => {
    expect(cfg).toMatch(/process\.env\.CI/);
    expect(cfg).toMatch(/BROWSER_HEAD/);
  });
});
