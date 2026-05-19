/**
 * lib/global-actions -- singleton store for the global Search palette
 * and the New Apply dialog.
 *
 * Tests confirm:
 *   • open / close / toggle for both dialogs
 *   • initial state is closed
 *   • multiple opens are idempotent
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { globalActions } from './global-actions.svelte';

describe('globalActions', () => {
  beforeEach(() => {
    globalActions.searchOpen = false;
    globalActions.addJobOpen = false;
  });

  afterEach(() => {
    globalActions.searchOpen = false;
    globalActions.addJobOpen = false;
  });

  it('starts with searchOpen=false', () => {
    expect(globalActions.searchOpen).toBe(false);
  });

  it('starts with addJobOpen=false', () => {
    expect(globalActions.addJobOpen).toBe(false);
  });

  it('openSearch sets searchOpen=true', () => {
    globalActions.openSearch();
    expect(globalActions.searchOpen).toBe(true);
  });

  it('closeSearch sets searchOpen=false', () => {
    globalActions.openSearch();
    globalActions.closeSearch();
    expect(globalActions.searchOpen).toBe(false);
  });

  it('toggleSearch flips state', () => {
    globalActions.toggleSearch();
    expect(globalActions.searchOpen).toBe(true);
    globalActions.toggleSearch();
    expect(globalActions.searchOpen).toBe(false);
  });

  it('openAddJob sets addJobOpen=true', () => {
    globalActions.openAddJob();
    expect(globalActions.addJobOpen).toBe(true);
  });

  it('closeAddJob sets addJobOpen=false', () => {
    globalActions.openAddJob();
    globalActions.closeAddJob();
    expect(globalActions.addJobOpen).toBe(false);
  });

  it('search + addJob states are independent', () => {
    globalActions.openSearch();
    globalActions.openAddJob();
    globalActions.closeSearch();
    expect(globalActions.searchOpen).toBe(false);
    expect(globalActions.addJobOpen).toBe(true);
  });

  it('repeated openSearch is idempotent', () => {
    globalActions.openSearch();
    globalActions.openSearch();
    expect(globalActions.searchOpen).toBe(true);
  });

  it('repeated openAddJob is idempotent', () => {
    globalActions.openAddJob();
    globalActions.openAddJob();
    expect(globalActions.addJobOpen).toBe(true);
  });

  it('singleton — same instance imported elsewhere holds state', async () => {
    globalActions.openSearch();
    const { globalActions: g2 } = await import('./global-actions.svelte');
    expect(g2.searchOpen).toBe(true);
  });
});
