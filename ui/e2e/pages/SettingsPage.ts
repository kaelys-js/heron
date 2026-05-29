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
    // The profile page renders TWO theme menus -- one in the Topbar
    // (global, always-visible) and one inside the profile body itself.
    // Both share the aria-label "Theme: <mode>". Resolve to the FIRST
    // match (the Topbar's instance is reliably present + identical in
    // behaviour). Without .first(), Playwright strict-mode bails.
    this.themeToggle = page.getByRole('button', { name: /theme|dark|light mode/i }).first();
    this.apiKeyInput = page.locator('input[type="password"], input[name="apiKey"]').first();
    this.saveApiKeyButton = page.getByRole('button', { name: /save|update key/i });
    this.profileSwitcher = page.getByRole('button', { name: /switch profile|profiles/i });
  }

  async gotoProfile(): Promise<void> {
    await this.page.goto('/profile');
  }

  async toggleTheme(): Promise<void> {
    // ThemeToggle is a dropdown (Light / Dark / System), not a single
    // flip-style switch. Click opens the menu; the test then has to
    // pick a different option than the current resolved theme. Read
    // the current `document.documentElement` theme + click the OTHER
    // option (light <-> dark).
    const current = await this.page.evaluate(() => {
      const el = document.documentElement;
      return el.getAttribute('data-theme') ?? (el.classList.contains('dark') ? 'dark' : 'light');
    });
    const target: 'Light' | 'Dark' = current === 'dark' ? 'Light' : 'Dark';
    await this.themeToggle.click();
    // The menu is a DropdownMenu on desktop (items are role="menuitem")
    // and a bottom-Sheet on mobile (items are plain role="button" rows --
    // see ResponsiveActionItem.svelte). Match either role by accessible
    // name so the helper works across every viewport.
    const option = new RegExp(`^${target}\\b`, 'i');
    await this.page
      .getByRole('menuitem', { name: option })
      .or(this.page.getByRole('button', { name: option }))
      .first()
      .click();
  }

  async saveApiKey(key: string): Promise<void> {
    await this.apiKeyInput.fill(key);
    await this.saveApiKeyButton.click();
  }
}
