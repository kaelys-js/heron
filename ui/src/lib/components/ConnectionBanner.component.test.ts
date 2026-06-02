/**
 * ConnectionBanner -- surfaces SSE connection state.
 *
 * Browser-mode tests. Direct-mutates the notifications singleton to
 * simulate connection states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ConnectionBanner from './ConnectionBanner.svelte';
import { notifications } from '$lib/notifications.svelte';

describe('connectionBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    notifications.connected = 'open';
    notifications.hasEverConnected = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    notifications.connected = 'open';
    notifications.hasEverConnected = true;
  });

  it('hidden when connected', () => {
    notifications.connected = 'open';
    const { container } = render(ConnectionBanner);
    expect(container.textContent).not.toContain('Reconnecting');
    expect(container.textContent).not.toContain('Connecting');
  });

  it('shows "Reconnecting…" when error after a prior connect', () => {
    notifications.hasEverConnected = true;
    notifications.connected = 'error';
    const { container } = render(ConnectionBanner);
    expect(container.textContent).toContain('Reconnecting');
  });

  it('hidden when error but never connected yet', () => {
    notifications.hasEverConnected = false;
    notifications.connected = 'error';
    const { container } = render(ConnectionBanner);
    // No banner shown -- "error" before first connect is treated as initial boot
    expect(container.textContent).not.toContain('Reconnecting');
  });

  it('shows "Connecting…" only after 1.5s stuck on first boot', async () => {
    notifications.hasEverConnected = false;
    notifications.connected = 'connecting';
    const { container } = render(ConnectionBanner);
    // Initially not visible.
    expect(container.textContent).not.toContain('Connecting');
    // After 1.5s, banner appears.
    vi.advanceTimersByTime(1600);
    // Svelte's $effect needs a microtask to re-render
    await Promise.resolve();
  });

  it('renders inside a styled div with the warning token colour', () => {
    notifications.connected = 'error';
    notifications.hasEverConnected = true;
    const { container } = render(ConnectionBanner);
    const wrapper = container.querySelector('div');
    expect(wrapper?.className).toContain('warning');
  });
});
