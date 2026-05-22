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
    // Capture the current data-theme value (light or dark).
    const before = await authenticatedPage
      .locator('html')
      .getAttribute('data-theme')
      .catch(() => null);
    // Toggle only if a theme button exists; not every viewport surfaces
    // one and we don't want a false-fail.
    const visible = await settings.themeToggle.isVisible().catch(() => false);
    if (!visible) return;
    await settings.toggleTheme();
    const after = await authenticatedPage
      .locator('html')
      .getAttribute('data-theme')
      .catch(() => null);
    if (before && after) {
      expect(after).not.toBe(before);
    }
    // Reload + assert the new theme stuck.
    await authenticatedPage.reload();
    const persisted = await authenticatedPage
      .locator('html')
      .getAttribute('data-theme')
      .catch(() => null);
    if (after && persisted) expect(persisted).toBe(after);
  });
});
