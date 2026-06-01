/** ipc-sender.test -- the pure sender-origin classifier + the assertSender
 *  guard. No electron import needed: assertSender only reads event.senderFrame,
 *  which we stub. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTrustedSenderOrigin, assertSender } from './ipc-sender';

const scheme = 'heron';

describe('isTrustedSenderOrigin', () => {
  it('trusts the app scheme origin (prod)', () => {
    // electron-serve content reports its origin as the app scheme.
    expect(
      isTrustedSenderOrigin(`${scheme}://app`, { customScheme: scheme, devServerUrl: null }),
    ).toBe(true);
  });

  it('trusts the dev-server origin only when a dev URL is set', () => {
    expect(
      isTrustedSenderOrigin('http://localhost:5173', {
        customScheme: scheme,
        devServerUrl: 'http://localhost:5173',
      }),
    ).toBe(true);
    // In prod (no dev url) the same http origin is foreign.
    expect(
      isTrustedSenderOrigin('http://localhost:5173', { customScheme: scheme, devServerUrl: null }),
    ).toBe(false);
  });

  it('rejects a foreign origin', () => {
    expect(
      isTrustedSenderOrigin('https://evil.example', { customScheme: scheme, devServerUrl: null }),
    ).toBe(false);
  });

  it('rejects a null / empty / undefined origin (detached or opaque frame)', () => {
    const ctx = { customScheme: scheme, devServerUrl: 'http://localhost:5173' };
    expect(isTrustedSenderOrigin(null, ctx)).toBe(false);
    expect(isTrustedSenderOrigin(undefined, ctx)).toBe(false);
    expect(isTrustedSenderOrigin('', ctx)).toBe(false);
  });
});

describe('assertSender', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const ctx = { customScheme: scheme, devServerUrl: null };

  it('passes a message from a trusted internal frame', () => {
    expect(assertSender({ senderFrame: { origin: `${scheme}://app` } }, ctx)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects + logs a message from a foreign origin', () => {
    expect(assertSender({ senderFrame: { origin: 'https://evil.example' } }, ctx)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('untrusted sender'));
  });

  it('rejects + logs when senderFrame is null (frame disposed/navigated)', () => {
    expect(assertSender({ senderFrame: null }, ctx)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('<none>'));
  });
});
