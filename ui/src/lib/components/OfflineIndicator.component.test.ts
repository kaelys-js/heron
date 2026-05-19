/**
 * OfflineIndicator -- top-of-viewport status pill.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import OfflineIndicator from './OfflineIndicator.svelte';
import { onlineStore } from '$lib/client/online-status.svelte';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    onlineStore.online = true;
  });

  afterEach(() => {
    onlineStore.online = true;
  });

  it('mounts without throwing in online state', () => {
    onlineStore.online = true;
    expect(() => render(OfflineIndicator)).not.toThrow();
  });

  it('mounts without throwing in offline state', () => {
    onlineStore.online = false;
    expect(() => render(OfflineIndicator)).not.toThrow();
  });

  it('renders into a real DOM container', () => {
    const { container } = render(OfflineIndicator);
    expect(container).toBeTruthy();
    // Component is fixed-position; container always exists even when
    // the indicator itself is hidden via opacity/transform.
    expect(container.children).toBeDefined();
  });
});
