/**
 * Profile-management E2E -- /profiles. Cross-profile switching.
 *
 * The seeded test user has ONE profile (default). This spec exercises
 * page rendering + the active-profile badge. Add-profile / delete-
 * profile flows write to disk; we don't exercise those here to keep
 * test-isolation strong.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { ProfilePage } from './pages/ProfilePage';
import { checkA11y } from './_helpers/a11y';

test.describe('Profiles', () => {
  test('profiles page renders + a11y-clean', async ({ authenticatedPage }) => {
    const profiles = new ProfilePage(authenticatedPage);
    await profiles.goto();
    await expect(authenticatedPage).toHaveURL(/\/profiles/);
    // Page chrome renders -- the page heading "Profiles" is the simplest
    // anchor. Profile-row text varies by display name vs slug + can
    // include additional metadata; just verify the page didn't 500.
    await expect(authenticatedPage.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 5000,
    });
    await checkA11y(authenticatedPage);
  });

  test('active profile indicator is somewhere on the page', async ({ authenticatedPage }) => {
    const profiles = new ProfilePage(authenticatedPage);
    await profiles.goto();
    // Three possible active-profile indicators (any one is sufficient):
    //   - <data-testid="active-profile-badge"> badge (the future shape)
    //   - aria-current attribute on the active row
    //   - the literal text "Active" inside a profile-row
    // Tolerate all three so the test doesn't false-fail when the design
    // evolves between any of those equivalent surfaces.
    const badgeVisible = await profiles.activeBadge.isVisible({ timeout: 2000 }).catch(() => false);
    const ariaCurrentVisible = await authenticatedPage
      .locator('[aria-current="page"], [aria-current="true"]')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const activeTextVisible = await authenticatedPage
      .getByText(/active/i)
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(badgeVisible || ariaCurrentVisible || activeTextVisible).toBe(true);
  });
});
