/**
 * RuntimesPage -- /runtimes. AI CLI swap (claude / codex / gemini /
 * copilot / opencode / qwen). Each option triggers a spawn config
 * change in lib/config/cli.ts.
 */

import type { Locator, Page } from '@playwright/test';

export class RuntimesPage {
  readonly page: Page;
  readonly cliSelect: Locator;
  readonly modelSelect: Locator;
  readonly saveButton: Locator;
  readonly currentBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cliSelect = page.getByRole('combobox', { name: /cli|runtime|agent/i });
    this.modelSelect = page.getByRole('combobox', { name: /model/i });
    this.saveButton = page.getByRole('button', { name: /save|apply|switch/i });
    this.currentBadge = page.locator('[data-testid="current-cli-badge"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/runtimes');
  }

  async selectCli(
    cli: 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode' | 'qwen',
  ): Promise<void> {
    await this.cliSelect.click();
    await this.page.getByRole('option', { name: new RegExp(cli, 'i') }).click();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }
}
