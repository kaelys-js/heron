/**
 * LoginPage -- selectors + actions for /login.
 *
 * Auth-spec exclusive: every other spec uses the authenticatedPage
 * fixture which bypasses login entirely. This POM exists for the
 * cold-path login.spec.ts + the e2e/auth/login.spec.ts a11y smoke.
 */

import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly passkeyButton: Locator;
  readonly inviteCodeButton: Locator;
  readonly githubButton: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.passkeyButton = page.getByRole('button', { name: /passkey/i });
    this.inviteCodeButton = page.getByRole('button', { name: /invite code/i });
    this.githubButton = page.getByRole('button', { name: /github/i });
    this.errorToast = page.locator('[role="alert"]').filter({ hasText: /error|invalid|failed/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async clickPasskey(): Promise<void> {
    await this.passkeyButton.click();
  }
}
