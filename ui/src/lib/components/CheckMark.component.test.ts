/**
 * CheckMark -- animated checkmark used by the responsive primitives.
 *
 * Simple component without snippet props -- great browser-mode smoke
 * for the testing-library/svelte + Playwright wiring.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import CheckMark from './CheckMark.svelte';

describe('checkMark', () => {
  it('renders a span element', () => {
    const { container } = render(CheckMark);
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('renders an inner Check svg', () => {
    const { container } = render(CheckMark);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('inactive by default — opacity-0 + scale-50', () => {
    const { container } = render(CheckMark);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('opacity-0');
    expect(span.className).toContain('scale-50');
  });

  it('active=true → opacity-100 + scale-100', () => {
    const { container } = render(CheckMark, { props: { active: true } });
    const span = container.querySelector('span')!;
    expect(span.className).toContain('opacity-100');
    expect(span.className).toContain('scale-100');
  });

  it('inactive → aria-hidden="true"', () => {
    const { container } = render(CheckMark);
    const span = container.querySelector('span')!;
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });

  it('active → aria-hidden="false"', () => {
    const { container } = render(CheckMark, { props: { active: true } });
    const span = container.querySelector('span')!;
    expect(span.getAttribute('aria-hidden')).toBe('false');
  });

  it('accepts custom class prop', () => {
    const { container } = render(CheckMark, { props: { class: 'my-custom-class' } });
    const span = container.querySelector('span')!;
    expect(span.className).toContain('my-custom-class');
  });

  it('check icon has emerald color', () => {
    const { container } = render(CheckMark);
    expect(container.innerHTML).toContain('text-emerald-400');
  });
});
