/**
 * Settings E2E -- profile settings page (theme toggle, API key
 * persistence).
 */

import { test, expect } from './fixtures/auth-fixtures';
import { SettingsPage } from './pages/SettingsPage';
import { checkA11y } from './_helpers/a11y';

test.describe('Settings', () => {
  test('profile page renders + a11y-clean', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);
    await settings.gotoProfile();
    await expect(authenticatedPage).toHaveURL(/\/profile/);
    await checkA11y(authenticatedPage);
  });

  test('theme toggle persists across reload', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);
    const readTheme = (): Promise<string | null> =>
      authenticatedPage.evaluate(() => {
        const el = document.documentElement;
        return el.getAttribute('data-theme') ?? (el.classList.contains('dark') ? 'dark' : 'light');
      });

    // The toggle + settle interaction occasionally trips the WebKit
    // "Target page/context/browser has been closed" crash mid-click. The
    // assertion itself (theme flips + persists) is REAL and is never
    // weakened -- we only re-run the interaction from a fresh navigation
    // when the page died under us. A genuine "theme doesn't flip" bug
    // still fails: the inner waitForFunction throws a TimeoutError, which
    // is NOT a closed-page error, so it propagates immediately.
    const isClosedPageError = (err: unknown): boolean =>
      err instanceof Error && /has been closed|Target (page|context|browser)/i.test(err.message);

    let before: string | null = null;
    let after: string | null = null;
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        await settings.gotoProfile();
        // The theme toggle MUST be present on /profile -- it's the
        // canonical place users change theme. Failing this is a real bug.
        await expect(settings.themeToggle).toBeVisible({ timeout: 5000 });
        // Capture the initial theme. Either data-theme attr OR .dark class
        // -- the layout uses both depending on tw mode-watcher version.
        before = await readTheme();
        await settings.toggleTheme();
        // Wait for the DOM to settle before asserting the flip.
        await authenticatedPage.waitForFunction(
          (prev) => {
            const el = document.documentElement;
            const cur =
              el.getAttribute('data-theme') ?? (el.classList.contains('dark') ? 'dark' : 'light');
            return cur !== prev;
          },
          before,
          { timeout: 5000 },
        );
        after = await readTheme();
        break;
      } catch (err) {
        if (attempt < maxAttempts && isClosedPageError(err)) continue;
        throw err;
      }
    }

    expect(after).not.toBe(before);
    // Persistence: reload + assert the new theme stuck.
    await authenticatedPage.reload();
    const persisted = await readTheme();
    expect(persisted).toBe(after);
  });
});
