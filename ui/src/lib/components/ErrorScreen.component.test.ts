/**
 * ErrorScreen -- the ONE shared base for every error/status surface.
 *
 * WHY these assertions matter: 403/404/500 must all render the SAME base (the
 * brand bloom + a legible status numeral + title + copy). A regression that
 * drops the bloom base or the status/title would silently make an error screen
 * look generic again -- these catch that for the codes the app actually emits.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import ErrorScreen from './ErrorScreen.svelte';

describe('ErrorScreen', () => {
  afterEach(cleanup); // unmount between cases so getByText doesn't see prior renders

  it.each([
    [404, 'Page not found'],
    [403, 'No access'],
    [500, 'Something broke'],
  ])('renders the %i status numeral + title on the shared bloom base', (status, title) => {
    const { container, getByText } = render(ErrorScreen, {
      props: { status, title, description: 'recovery copy' },
    });
    expect(getByText(String(status))).toBeTruthy();
    expect(getByText(title)).toBeTruthy();
    expect(getByText('recovery copy')).toBeTruthy();
    // The shared base: BloomBackground's dawn-sky gradient layer.
    expect(container.querySelector('.bloom-surface')).toBeTruthy();
  });

  it('renders without optional action/detail snippets', () => {
    expect(() =>
      render(ErrorScreen, {
        props: { status: 503, title: 'Temporarily unavailable', description: 'x' },
      }),
    ).not.toThrow();
  });

  it('keeps the "Error N: title" aria-label when a status is given', () => {
    // WHY: the numeral is aria-hidden, so the h1 carries the full context for
    // screen readers. Dropping the prefix would make SR users lose the code.
    const { container } = render(ErrorScreen, {
      props: { status: 500, title: 'Something broke', description: 'x' },
    });
    expect(container.querySelector('h1')?.getAttribute('aria-label')).toBe(
      'Error 500: Something broke',
    );
  });

  it('omits the numeral + "Error N:" prefix for a non-HTTP failure (no status)', () => {
    // WHY: a client-side render crash has no HTTP status -- forcing a numeral
    // (or an "Error undefined:" aria-label) would read as broken. The page-crash
    // boundary relies on this to reuse ErrorScreen as a branded surface.
    const { container, getByText } = render(ErrorScreen, {
      props: { title: 'This page crashed', description: 'recovery copy' },
    });
    expect(getByText('This page crashed')).toBeTruthy();
    expect(getByText('recovery copy')).toBeTruthy();
    // No large status numeral when status is undefined.
    expect(container.querySelector('.font-mono.text-5xl')).toBeNull();
    // h1 aria-label is just the title (no "Error …:" prefix).
    expect(container.querySelector('h1')?.getAttribute('aria-label')).toBe('This page crashed');
    // Still the shared branded base.
    expect(container.querySelector('.bloom-surface')).toBeTruthy();
  });
});
