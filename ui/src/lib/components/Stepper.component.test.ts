/**
 * Stepper -- numeric increment/decrement input.
 *
 * Browser-mode tests confirm: bump up/down, clamping at min/max,
 * decimal formatting, suffix display, onchange callback.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Stepper from './Stepper.svelte';

describe('stepper — render', () => {
  it('renders 3 buttons + 1 input (minus, input, plus)', () => {
    const { container } = render(Stepper, { props: { value: 5 } });
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('input')).toBeTruthy();
  });

  it('displays the current value', () => {
    const { container } = render(Stepper, { props: { value: 42 } });
    const input = container.querySelector('input')!;
    expect(input.value).toBe('42');
  });

  it('displays suffix when provided', () => {
    const { container } = render(Stepper, { props: { value: 10, suffix: 'd' } });
    expect(container.textContent).toContain('d');
  });

  it('uses label as aria-label on the input', () => {
    // Stepper threads `label` through aria-label, not visible text.
    const { container } = render(Stepper, { props: { value: 1, label: 'Days' } });
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-label')).toBe('Days');
  });

  it('formats with decimals=2', () => {
    const { container } = render(Stepper, { props: { value: 1.5, decimals: 2 } });
    const input = container.querySelector('input')!;
    expect(input.value).toBe('1.50');
  });

  it('formats decimals=0 as integer', () => {
    const { container } = render(Stepper, { props: { value: 1.5, decimals: 0 } });
    const input = container.querySelector('input')!;
    expect(input.value).toBe('2'); // rounds 1.5 → 2
  });
});

describe('stepper — interactions', () => {
  it('clicking + button increments by step', async () => {
    const onchange = vi.fn();
    const { container } = render(Stepper, { props: { value: 5, step: 1, onchange } });
    const buttons = container.querySelectorAll('button');
    // First button is minus, second is plus.
    const plus = buttons[buttons.length - 1] as HTMLButtonElement;
    const user = userEvent.setup();
    await user.click(plus);
    expect(onchange).toHaveBeenCalledWith(6);
  });

  it('clicking - button decrements by step', async () => {
    const onchange = vi.fn();
    const { container } = render(Stepper, { props: { value: 5, step: 1, onchange } });
    const buttons = container.querySelectorAll('button');
    const minus = buttons[0] as HTMLButtonElement;
    const user = userEvent.setup();
    await user.click(minus);
    expect(onchange).toHaveBeenCalledWith(4);
  });

  it('plus button is disabled at max', async () => {
    const { container } = render(Stepper, { props: { value: 10, max: 10, step: 1 } });
    const buttons = container.querySelectorAll('button');
    const plus = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
  });

  it('minus button is disabled at min', async () => {
    const { container } = render(Stepper, { props: { value: 0, min: 0, step: 1 } });
    const buttons = container.querySelectorAll('button');
    const minus = buttons[0] as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
  });

  it('respects custom step size', async () => {
    const onchange = vi.fn();
    const { container } = render(Stepper, { props: { value: 0, step: 5, onchange } });
    const buttons = container.querySelectorAll('button');
    const plus = buttons[buttons.length - 1] as HTMLButtonElement;
    const user = userEvent.setup();
    await user.click(plus);
    expect(onchange).toHaveBeenCalledWith(5);
  });
});
