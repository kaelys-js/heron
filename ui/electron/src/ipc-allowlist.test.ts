import { describe, expect, it } from 'vitest';
import { isAllowedChannel } from './ipc-allowlist';

describe('isAllowedChannel', () => {
  // WHY: the File-menu auth items (Login page / Sign in with passkey / Set up
  // with invite code) send `<brand>:menu:navigate` and `<brand>:menu:passkey`
  // from main. If the preload allowlist rejects them, the renderer bridge's
  // listener never registers and the menu items SILENTLY do nothing -- that was
  // the bug. These two channels MUST be allowed.
  it('allows the File-menu IPC channels', () => {
    expect(isAllowedChannel('heron:menu:navigate')).toBe(true);
    expect(isAllowedChannel('heron:menu:passkey')).toBe(true);
  });

  it('still allows the existing error + connectivity channels', () => {
    expect(isAllowedChannel('heron:main-error')).toBe(true);
    expect(isAllowedChannel('heron:net-status')).toBe(true);
  });

  it('is brand-agnostic (suffix match, any prefix)', () => {
    expect(isAllowedChannel('acme:menu:navigate')).toBe(true);
    expect(isAllowedChannel('acme:main-error')).toBe(true);
  });

  it('rejects arbitrary / unexpected channels', () => {
    expect(isAllowedChannel('heron:menu:evil')).toBe(false);
    expect(isAllowedChannel('fs:readFile')).toBe(false);
    expect(isAllowedChannel('heron:menu:navigate-extra')).toBe(false);
    expect(isAllowedChannel('')).toBe(false);
  });
});
