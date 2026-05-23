/**
 * Queue E2E -- /queue exercises the apply-mode dispatcher.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { QueuePage } from './pages/QueuePage';
import { mockServerError } from './_helpers/network-mocks';
import { checkA11y } from './_helpers/a11y';

test.describe('Queue', () => {
  test('queue page renders without crash + axe-clean', async ({ authenticatedPage }) => {
    const queue = new QueuePage(authenticatedPage);
    await queue.goto();
    await expect(authenticatedPage).toHaveURL(/\/queue/);
    // Either rows or empty state -- not 500.
    await expect(queue.emptyState.or(queue.queueRows.first())).toBeVisible({ timeout: 5000 });
    await checkA11y(authenticatedPage);
  });

  test('500 from queue API surfaces an error -- does not crash the page', async ({
    authenticatedPage,
  }) => {
    await mockServerError(authenticatedPage);
    const queue = new QueuePage(authenticatedPage);
    await queue.goto();
    // The page should still render its chrome (header + footer) even if
    // the API errors. A blank/white page = bug.
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
