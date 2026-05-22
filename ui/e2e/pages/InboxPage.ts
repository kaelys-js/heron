/**
 * InboxPage -- the dashboard's default landing route. Holds the
 * pending-evaluation queue + the "add job" entry point. Most flows
 * start here.
 */

import type { Locator, Page } from '@playwright/test';

export class InboxPage {
  readonly page: Page;
  readonly addJobButton: Locator;
  readonly jobUrlInput: Locator;
  readonly submitAddJobButton: Locator;
  readonly statusFilter: Locator;
  readonly emptyState: Locator;
  readonly jobRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addJobButton = page.getByRole('button', { name: /add job|new job|add posting/i });
    this.jobUrlInput = page.getByPlaceholder(/url|paste|https:\/\//i).first();
    this.submitAddJobButton = page.getByRole('button', { name: /submit|add|save/i });
    this.statusFilter = page.getByRole('combobox', { name: /status/i });
    this.emptyState = page.getByText(/no jobs|empty|inbox is empty/i);
    this.jobRows = page.locator('[data-testid="job-row"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/inbox');
  }

  async openAddJobDialog(): Promise<void> {
    await this.addJobButton.click();
  }

  async submitJobUrl(url: string): Promise<void> {
    await this.jobUrlInput.fill(url);
    await this.submitAddJobButton.click();
  }

  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: new RegExp(status, 'i') }).click();
  }

  async countRows(): Promise<number> {
    return this.jobRows.count();
  }
}
