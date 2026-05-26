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
