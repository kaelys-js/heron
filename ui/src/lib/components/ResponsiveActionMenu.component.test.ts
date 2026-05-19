/**
 * ResponsiveActionMenu -- drawer on mobile, dropdown on desktop.
 *
 * Uses the snippet harness wrapper so we can pass {#snippet trigger}
 * + {#snippet items} through testing-library/svelte v5 (which doesn't
 * yet have a clean snippet-prop API).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import ResponsiveActionMenuHarness from './__test__/ResponsiveActionMenuHarness.svelte';

describe('ResponsiveActionMenu', () => {
  it('mounts without throwing', () => {
    expect(() => render(ResponsiveActionMenuHarness)).not.toThrow();
  });

  it('renders the trigger button into the DOM', () => {
    const { container } = render(ResponsiveActionMenuHarness);
    expect(container.querySelector('[data-testid=harness-trigger]')).toBeTruthy();
  });

  it('accepts a custom title prop', () => {
    const { container } = render(ResponsiveActionMenuHarness, {
      props: { title: 'Custom Title' },
    });
    expect(container).toBeTruthy();
  });

  it('accepts a description prop', () => {
    const { container } = render(ResponsiveActionMenuHarness, {
      props: { description: 'A description' },
    });
    expect(container).toBeTruthy();
  });
});
