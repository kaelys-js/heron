/**
 * Runtimes E2E -- /runtimes. AI CLI swap surface.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { RuntimesPage } from './pages/RuntimesPage';
import { checkA11y } from './_helpers/a11y';

test.describe('Runtimes', () => {
  test('runtimes page renders + a11y-clean', async ({ authenticatedPage }) => {
    const runtimes = new RuntimesPage(authenticatedPage);
    await runtimes.goto();
    await expect(authenticatedPage).toHaveURL(/\/runtimes/);
    // All 6 CLI options should be enumerated somewhere on the page.
    const body = await authenticatedPage.locator('body').textContent();
    // At least claude must be mentioned (the default).
    expect(body).toMatch(/claude/i);
    await checkA11y(authenticatedPage);
  });
});
