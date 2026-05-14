/**
 * BackendUnreachableOverlay — full-screen blocker when backend is
 * unreachable for > RECONNECT_GRACE_MS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import BackendUnreachableOverlay from './BackendUnreachableOverlay.svelte';
import { onlineStore } from '$lib/client/online-status.svelte';

describe('BackendUnreachableOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onlineStore.online = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineStore.online = true;
  });

  it('hidden when online', () => {
    onlineStore.online = true;
    const { container } = render(BackendUnreachableOverlay);
    expect(container.textContent ?? '').not.toContain('reach the server');
  });

  it('still hidden during the grace window after going offline', () => {
    onlineStore.online = false;
    const { container } = render(BackendUnreachableOverlay);
    // Grace period — should NOT be visible yet
    vi.advanceTimersByTime(1_000);
    expect(container.textContent ?? '').not.toContain('reach the server');
  });
});
