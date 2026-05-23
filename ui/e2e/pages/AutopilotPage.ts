/**
 * AutopilotPage -- /autopilot. Schedule + pause-toggle + manual
 * dispatch for the recurring scan + apply pipeline.
 */

import type { Locator, Page } from '@playwright/test';

export class AutopilotPage {
  readonly page: Page;
  readonly pauseToggle: Locator;
  readonly scheduleSelect: Locator;
  readonly manualDispatchButton: Locator;
  readonly statusBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pauseToggle = page.getByRole('switch', { name: /pause|enabled|active/i });
    this.scheduleSelect = page.getByRole('combobox', { name: /schedule|frequency/i });
    this.manualDispatchButton = page.getByRole('button', { name: /run now|manual|dispatch now/i });
    this.statusBadge = page.locator('[data-testid="autopilot-status"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/autopilot');
  }

  async togglePause(): Promise<void> {
    await this.pauseToggle.click();
  }

  async setSchedule(value: string): Promise<void> {
    await this.scheduleSelect.click();
    await this.page.getByRole('option', { name: new RegExp(value, 'i') }).click();
  }

  async dispatchManual(): Promise<void> {
    await this.manualDispatchButton.click();
  }
}
