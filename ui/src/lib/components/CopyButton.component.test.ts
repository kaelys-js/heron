/**
 * CopyButton -- copies text + gives accessible, animated feedback.
 *
 * WHY: error pages show a correlation id the user must be able to hand to
 * support. The copy must (a) actually write the FULL value, (b) confirm visually
 * (Copy→Check), and (c) announce to a screen reader via a live region -- without
 * the button's NAME changing (which would re-announce the control, not the
 * result). These assert that contract.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { copyToClipboard } from '$lib/client/capacitor-plugins';
import CopyButton from './CopyButton.svelte';

vi.mock('$lib/client/capacitor-plugins', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(copyToClipboard).mockClear();
  });

  it('writes the full text, shows the checkmark, and announces the result', async () => {
    const { getByRole, findByText, queryByText } = render(CopyButton, {
      props: { text: 'a3f9c1e2-0000-4abc-9def-112233445566', label: 'error reference' },
    });
    const btn = getByRole('button', { name: /copy error reference/i });
    // Not copied yet -- no confirmation text or live message.
    expect(queryByText('Copied')).toBeNull();

    await fireEvent.click(btn);

    // Full value is what gets copied (display may be a short prefix elsewhere).
    expect(vi.mocked(copyToClipboard)).toHaveBeenCalledWith('a3f9c1e2-0000-4abc-9def-112233445566');
    // Visual confirmation + the polite live-region announcement appear.
    expect(await findByText('Copied')).toBeTruthy();
    expect(await findByText('error reference copied')).toBeTruthy();
    // The accessible NAME stays stable (so the morph doesn't re-announce it).
    expect(getByRole('button', { name: /copy error reference/i })).toBeTruthy();
  });
});
