/**
 * ProfilePage -- /profiles. Multi-profile management: switch the
 * active profile, activate one, delete one.
 */

import type { Locator, Page } from '@playwright/test';

export class ProfilePage {
  readonly page: Page;
  readonly profileRows: Locator;
  readonly addProfileButton: Locator;
  readonly activeBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileRows = page.locator('[data-testid="profile-row"]');
    this.addProfileButton = page.getByRole('button', { name: /add profile|new profile/i });
    this.activeBadge = page.locator('[data-testid="active-profile-badge"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/profiles');
  }

  async activateProfile(slug: string): Promise<void> {
    const row = this.profileRows.filter({ hasText: slug });
    await row.getByRole('button', { name: /activate|switch/i }).click();
  }

  async deleteProfile(slug: string): Promise<void> {
    const row = this.profileRows.filter({ hasText: slug });
    await row.getByRole('button', { name: /delete|remove/i }).click();
    // Confirm dialog -- assert it appears + click confirm
    await this.page
      .getByRole('button', { name: /confirm|yes|delete/i })
      .last()
      .click();
  }
}
