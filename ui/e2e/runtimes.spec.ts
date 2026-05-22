/**
 * Runtimes E2E -- /runtimes. AI CLI swap surface.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { RuntimesPage } from './pages/RuntimesPage';
import { checkA11y } from './_helpers/a11y';

test.describe('Runtimes', () => {
  test('runtimes page renders + a11y-clean + lists all 6 CLI runtimes', async ({
    authenticatedPage,
  }) => {
    const runtimes = new RuntimesPage(authenticatedPage);
    await runtimes.goto();
    await expect(authenticatedPage).toHaveURL(/\/runtimes/);
    // The six-runtime contract: lib/config/cli.ts enumerates these
    // exact values. The /runtimes page must mention all six -- removing
    // any one without updating the contract is a regression.
    const body = await authenticatedPage.locator('body').textContent();
    for (const cli of ['claude', 'codex', 'gemini', 'copilot', 'opencode', 'qwen']) {
      expect(body, `expected /runtimes body to mention ${cli}`).toMatch(new RegExp(cli, 'i'));
    }
    await checkA11y(authenticatedPage);
  });
});
