/**
 * Autopilot E2E -- /autopilot. Pause/resume toggle, schedule change,
 * manual dispatch.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { AutopilotPage } from './pages/AutopilotPage';
import { checkA11y } from './_helpers/a11y';

test.describe('Autopilot', () => {
  test('autopilot page renders + a11y-clean', async ({ authenticatedPage }) => {
    const autopilot = new AutopilotPage(authenticatedPage);
    await autopilot.goto();
    await expect(authenticatedPage).toHaveURL(/\/autopilot/);
    // Page chrome must render even if no autopilot config exists yet.
    await expect(authenticatedPage.locator('h1, h2, [role="heading"]').first()).toBeVisible({
      timeout: 5000,
    });
    await checkA11y(authenticatedPage);
  });

  test('autopilot status badge is present', async ({ authenticatedPage }) => {
    const autopilot = new AutopilotPage(authenticatedPage);
    await autopilot.goto();
    // Two valid outcomes:
    //   - /autopilot rendered: the statusBadge MUST be visible
    //     (regression check -- a missing badge is a real bug)
    //   - /inbox: autopilot was not bootstrapped, the redirect is the
    //     designed-fallback path
    const url = authenticatedPage.url();
    if (url.includes('/autopilot')) {
      await expect(autopilot.statusBadge).toBeVisible({ timeout: 5000 });
    } else {
      expect(url).toMatch(/\/inbox/);
    }
  });
});
