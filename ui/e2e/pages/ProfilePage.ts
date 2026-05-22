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
    // The confirmation is rendered INLINE within the targeted row (not
    // as a page-level dialog). Scoping the confirm click to `row`
    // prevents clicking another profile's Delete button when multiple
    // are armed. The exact button label is "Delete" -- match exactly
    // to avoid the danger-only initial Delete being re-clicked.
    await row.getByRole('button', { name: /^delete$/i }).click();
  }
}
