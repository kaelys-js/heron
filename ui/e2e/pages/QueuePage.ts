/**
 * QueuePage -- /queue. The apply-queue surface. Shows posts that have
 * been Evaluated + scored >= threshold + are ready to apply
 * (autonomous or user-confirmed depending on profile.yml).
 */

import type { Locator, Page } from '@playwright/test';

export class QueuePage {
  readonly page: Page;
  readonly applyModeDropdown: Locator;
  readonly dispatchButton: Locator;
  readonly queueRows: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.applyModeDropdown = page.getByRole('combobox', { name: /apply mode|dispatch/i });
    this.dispatchButton = page.getByRole('button', { name: /dispatch|apply now/i });
    this.queueRows = page.locator('[data-testid="queue-row"]');
    this.emptyState = page.getByText(/queue is empty|nothing queued/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/queue');
  }

  async selectApplyMode(mode: 'linkedin' | 'open-and-mark' | 'mark'): Promise<void> {
    await this.applyModeDropdown.click();
    await this.page.getByRole('option', { name: new RegExp(mode, 'i') }).click();
  }

  async dispatch(): Promise<void> {
    await this.dispatchButton.click();
  }
}
