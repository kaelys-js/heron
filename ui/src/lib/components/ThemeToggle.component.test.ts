/**
 * ThemeToggle -- appearance picker built on ResponsiveActionMenu.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import ThemeToggle from './ThemeToggle.svelte';
import { theme } from '$lib/theme.svelte';

describe('ThemeToggle', () => {
  beforeEach(() => {
    theme.mode = 'system';
    theme.resolved = 'light';
  });

  afterEach(() => {
    theme.mode = 'system';
    theme.resolved = 'light';
  });

  it('mounts without throwing (system mode)', () => {
    expect(() => render(ThemeToggle)).not.toThrow();
  });

  it('mounts with mode=light', () => {
    theme.mode = 'light';
    theme.resolved = 'light';
    expect(() => render(ThemeToggle)).not.toThrow();
  });

  it('mounts with mode=dark', () => {
    theme.mode = 'dark';
    theme.resolved = 'dark';
    expect(() => render(ThemeToggle)).not.toThrow();
  });

  it('renders an aria-labelled trigger button reflecting the mode', () => {
    theme.mode = 'dark';
    theme.resolved = 'dark';
    const { container } = render(ThemeToggle);
    const btn = container.querySelector('button[aria-label]');
    expect(btn?.getAttribute('aria-label')).toContain('dark');
  });
});
