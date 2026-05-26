/**
 * BackendBootGuard -- the "can't connect" gate.
 *
 * Pins the PER-ACTION loading state: triggering one action (Try again /
 * Connect) must spin ONLY its own button, never the other. The original bug
 * was a single shared `busy` flag that drove both buttons' spinners.
 *
 * Backend discovery is mocked with a never-resolving promise so the in-flight
 * state stays set and is stable to assert against (no network, no timers).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import BackendBootGuard from './BackendBootGuard.svelte';

vi.mock('$lib/client/backend-discovery', () => ({
  resolveBackend: vi.fn(() => new Promise<never>(() => {})),
  setManualBackend: vi.fn(() => Promise.resolve()),
}));

function byTestId(container: HTMLElement, id: string): HTMLButtonElement {
  return container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
}
function isSpinning(btn: HTMLElement): boolean {
  return !!btn.querySelector('.animate-spin');
}

async function openManualAndType(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  const toggle = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Enter a server address'),
  );
  await user.click(toggle as HTMLButtonElement);
  await tick();
  const input = container.querySelector('input[type="url"]') as HTMLInputElement;
  await user.type(input, '192.168.1.20:5173');
  await tick();
}

describe('BackendBootGuard — per-action loading state', () => {
  it('renders the error card with a Try again button in preview mode', () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    expect(byTestId(container, 'boot-retry')).toBeTruthy();
    expect(container.textContent).toContain("Can't connect");
  });

  it('clicking "Try again" spins ONLY the retry button, not Connect', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    await openManualAndType(container, user);

    await user.click(byTestId(container, 'boot-retry'));
    await tick();

    const retry = byTestId(container, 'boot-retry');
    const connect = byTestId(container, 'boot-connect');
    expect(isSpinning(retry)).toBe(true);
    expect(retry.textContent).toContain('Reconnecting');
    // Regression guard: the shared-`busy` bug also spun Connect.
    expect(isSpinning(connect)).toBe(false);
    expect(connect.textContent).not.toContain('Connecting');
  });

  it('clicking "Connect" spins ONLY the connect button, not Try again', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    await openManualAndType(container, user);

    await user.click(byTestId(container, 'boot-connect'));
    await tick();

    const retry = byTestId(container, 'boot-retry');
    const connect = byTestId(container, 'boot-connect');
    expect(isSpinning(connect)).toBe(true);
    expect(connect.textContent).toContain('Connecting');
    expect(isSpinning(retry)).toBe(false);
    expect(retry.textContent).not.toContain('Reconnecting');
  });
});

describe('BackendBootGuard — URL validation', () => {
  async function openManual(
    container: HTMLElement,
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<HTMLInputElement> {
    const toggle = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Enter a server address'),
    );
    await user.click(toggle as HTMLButtonElement);
    await tick();
    return container.querySelector('input[type="url"]') as HTMLInputElement;
  }

  it('keeps Connect disabled until a valid address is entered', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    const input = await openManual(container, user);
    expect(byTestId(container, 'boot-connect').disabled).toBe(true); // empty
    await user.type(input, 'abc'); // bare word: parses but is not a real host
    await tick();
    expect(byTestId(container, 'boot-connect').disabled).toBe(true);
  });

  it('shows a helpful error (and marks aria-invalid) on blur of an invalid address', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    const input = await openManual(container, user);
    await user.type(input, 'abc');
    await user.tab(); // blur
    await tick();
    expect(container.textContent).toContain('Enter a host like');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not nag before the field is blurred', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    const input = await openManual(container, user);
    await user.type(input, 'abc');
    await tick();
    expect(container.textContent).not.toContain('Enter a host like');
  });

  it('enables Connect and clears the error once the address becomes valid', async () => {
    const { container } = render(BackendBootGuard, { props: { preview: true } });
    const user = userEvent.setup();
    const input = await openManual(container, user);
    await user.type(input, 'abc');
    await user.tab();
    await tick();
    expect(byTestId(container, 'boot-connect').disabled).toBe(true);

    await user.clear(input);
    await user.type(input, '192.168.1.20:5173');
    await tick();
    expect(byTestId(container, 'boot-connect').disabled).toBe(false);
    expect(container.textContent).not.toContain('Enter a host like');
  });
});
