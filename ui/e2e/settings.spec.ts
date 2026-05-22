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
    await settings.gotoProfile();
    // The theme toggle MUST be present on /profile -- it's the canonical
    // place users change theme. Failing this assertion is a real bug.
    await expect(settings.themeToggle).toBeVisible({ timeout: 5000 });
    // Capture the initial theme. Either data-theme attr OR .dark class
    // -- the layout uses both depending on tw mode-watcher version.
    const readTheme = (): Promise<string | null> =>
      authenticatedPage.evaluate(() => {
        const el = document.documentElement;
        return el.getAttribute('data-theme') ?? (el.classList.contains('dark') ? 'dark' : 'light');
      });
    const before = await readTheme();
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
    const after = await readTheme();
    expect(after).not.toBe(before);
    // Persistence: reload + assert the new theme stuck.
    await authenticatedPage.reload();
    const persisted = await readTheme();
    expect(persisted).toBe(after);
  });
});
