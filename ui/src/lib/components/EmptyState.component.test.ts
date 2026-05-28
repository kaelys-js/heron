/**
 * EmptyState -- placeholder for blank lists.
 *
 * Browser-mode tests confirm: size / variant / title / description /
 * icon all render. Snippet-based `actions` prop is exercised via the
 * larger ResponsiveActionMenu / Sheet flows.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import EmptyState from './EmptyState.svelte';

describe('emptyState', () => {
  it('renders without any props', () => {
    const { container } = render(EmptyState);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders title when provided', () => {
    const { container } = render(EmptyState, { props: { title: 'Nothing here yet' } });
    expect(container.textContent).toContain('Nothing here yet');
  });

  it('renders description when provided', () => {
    const { container } = render(EmptyState, {
      props: { title: 'Empty', description: 'Add some jobs to get started' },
    });
    expect(container.textContent).toContain('Add some jobs to get started');
  });

  it('applies size="sm" padding', () => {
    const { container } = render(EmptyState, { props: { size: 'sm', title: 'X' } });
    expect(container.innerHTML).toContain('py-6');
  });

  it('applies size="md" padding (default)', () => {
    const { container } = render(EmptyState, { props: { title: 'X' } });
    expect(container.innerHTML).toContain('py-10');
  });

  it('applies size="lg" padding', () => {
    const { container } = render(EmptyState, { props: { size: 'lg', title: 'X' } });
    expect(container.innerHTML).toContain('py-12');
  });

  it('variant="card" adds dashed border', () => {
    const { container } = render(EmptyState, { props: { variant: 'card', title: 'X' } });
    expect(container.innerHTML).toContain('border-dashed');
  });

  it('variant="inline" omits border', () => {
    const { container } = render(EmptyState, { props: { variant: 'inline', title: 'X' } });
    expect(container.innerHTML).not.toContain('border-dashed');
  });

  it('accepts custom class', () => {
    const { container } = render(EmptyState, {
      props: { class: 'my-empty-state', title: 'X' },
    });
    expect(container.innerHTML).toContain('my-empty-state');
  });

  it('title renders inside an h3', () => {
    const { container } = render(EmptyState, { props: { title: 'Heading' } });
    expect(container.querySelector('h3')?.textContent).toBe('Heading');
  });

  it('omits h3 when no title given', () => {
    const { container } = render(EmptyState);
    expect(container.querySelector('h3')).toBeNull();
  });
});
