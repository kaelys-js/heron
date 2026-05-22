/**
 * SettingsPage -- /profile and adjacent settings (theme, runtime,
 * API keys). Multi-route POM by design: the dashboard splits "user
 * settings" across a few URLs so the SettingsPage helper navigates
 * to each as needed.
 */

import type { Locator, Page } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly themeToggle: Locator;
  readonly apiKeyInput: Locator;
  readonly saveApiKeyButton: Locator;
  readonly profileSwitcher: Locator;

  constructor(page: Page) {
    this.page = page;
    this.themeToggle = page.getByRole('button', { name: /theme|dark|light mode/i });
    this.apiKeyInput = page.locator('input[type="password"], input[name="apiKey"]').first();
    this.saveApiKeyButton = page.getByRole('button', { name: /save|update key/i });
    this.profileSwitcher = page.getByRole('button', { name: /switch profile|profiles/i });
  }

  async gotoProfile(): Promise<void> {
    await this.page.goto('/profile');
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }

  async saveApiKey(key: string): Promise<void> {
    await this.apiKeyInput.fill(key);
    await this.saveApiKeyButton.click();
  }
}
