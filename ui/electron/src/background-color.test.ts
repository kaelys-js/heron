import { describe, expect, it } from 'vitest';
import { resolveBackgroundColor } from './background-color';

describe('resolveBackgroundColor', () => {
  it('prefers an electron-block override over the top-level value', () => {
    expect(
      resolveBackgroundColor({
        backgroundColor: '#0e1014',
        electron: { backgroundColor: '#000000' },
      }),
    ).toBe('#000000');
  });

  it('falls back to the top-level backgroundColor when the electron block omits it', () => {
    // This is the exact config shape that crashed init(): the Capacitor config
    // sets a TOP-LEVEL backgroundColor but the electron block has none. The old
    // code guarded on the top-level value yet read electron.backgroundColor
    // (undefined) and passed it to webContents.setBackgroundColor(), which
    // throws "conversion failure from undefined" -- before the window was ever
    // revealed. The resolver must return the value that actually exists.
    expect(resolveBackgroundColor({ backgroundColor: '#0e1014', electron: {} })).toBe('#0e1014');
    expect(resolveBackgroundColor({ backgroundColor: '#0e1014' })).toBe('#0e1014');
  });

  it('returns undefined when neither is set (let Electron use its default, never crash)', () => {
    expect(resolveBackgroundColor({})).toBeUndefined();
    expect(resolveBackgroundColor({ electron: {} })).toBeUndefined();
  });
});
