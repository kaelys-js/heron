/**
 * Runtimes E2E -- /runtimes. System health surface.
 *
 * /runtimes lists every runtime + integration the pipeline depends on:
 * Node.js + Python (required runtimes), Anthropic + Gemini + Adzuna
 * (optional integrations). Each card surfaces "Healthy", "Not
 * configured", or "Degraded" with status badges.
 *
 * The historic "lists all 6 CLI runtimes" assertion was fictional --
 * lib/config/cli.ts only exports a single AGENT_CLI binding (the
 * envvar fallback); the dashboard never enumerated codex / qwen /
 * opencode / etc. on /runtimes. The page is about runtime HEALTH,
 * not AGENT_CLI variants.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { RuntimesPage } from './pages/RuntimesPage';
import { checkA11y } from './_helpers/a11y';

test.describe('Runtimes', () => {
  test('runtimes page renders + a11y-clean + lists every runtime + integration', async ({
    authenticatedPage,
  }) => {
    const runtimes = new RuntimesPage(authenticatedPage);
    await runtimes.goto();
    await expect(authenticatedPage).toHaveURL(/\/runtimes/);
    // Every required runtime + every optional integration must appear
    // on /runtimes. Removing any one without updating its data source
    // (runtimes/+page.server.ts) is a regression.
    const body = await authenticatedPage.locator('body').textContent();
    for (const card of ['Node.js', 'Python', 'Anthropic', 'Gemini', 'Adzuna']) {
      expect(body, `expected /runtimes body to mention ${card}`).toMatch(new RegExp(card, 'i'));
    }
    await checkA11y(authenticatedPage);
  });
});
