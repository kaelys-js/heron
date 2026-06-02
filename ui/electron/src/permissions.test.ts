/** permissions.test -- the pure decidePermission() policy PLUS
 *  installPermissionHandlers wiring (session.defaultSession mocked). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setDevicePermissionHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setPermissionRequestHandler: mocks.setPermissionRequestHandler,
      setPermissionCheckHandler: mocks.setPermissionCheckHandler,
      setDevicePermissionHandler: mocks.setDevicePermissionHandler,
    },
  },
}));

import { decidePermission, installPermissionHandlers } from './permissions';

const scheme = 'heron';
const ctx = { customScheme: scheme, devServerUrl: 'http://localhost:5173' };
const internal = 'http://localhost:5173';
const foreign = 'https://evil.example';

describe('decidePermission', () => {
  it('allows mic (media) + notifications from an internal origin', () => {
    expect(decidePermission('media', internal, ctx)).toBe(true);
    expect(decidePermission('notifications', `${scheme}://app`, ctx)).toBe(true);
  });

  it('denies camera / geolocation / usb / hid / serial / midi outright', () => {
    for (const p of ['geolocation', 'camera', 'usb', 'hid', 'serial', 'midi', 'clipboard-read']) {
      expect(decidePermission(p, internal, ctx)).toBe(false);
    }
  });

  it('denies even an allowed permission from a foreign / null origin', () => {
    expect(decidePermission('media', foreign, ctx)).toBe(false);
    expect(decidePermission('notifications', undefined, ctx)).toBe(false);
    expect(decidePermission('media', '', ctx)).toBe(false);
  });
});

describe('installPermissionHandlers', () => {
  beforeEach(() => {
    mocks.setPermissionRequestHandler.mockReset();
    mocks.setPermissionCheckHandler.mockReset();
    mocks.setDevicePermissionHandler.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('wires all three session handlers', () => {
    installPermissionHandlers(ctx);
    expect(mocks.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(mocks.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    expect(mocks.setDevicePermissionHandler).toHaveBeenCalledTimes(1);
  });

  it('request handler callbacks the decision, reading the requesting origin from details', () => {
    installPermissionHandlers(ctx);
    const handler = mocks.setPermissionRequestHandler.mock.calls[0][0] as (
      wc: unknown,
      perm: string,
      cb: (allow: boolean) => void,
      details: { requestingUrl?: string },
    ) => void;
    const cb = vi.fn();
    handler({}, 'media', cb, { requestingUrl: internal });
    expect(cb).toHaveBeenCalledWith(true);
    cb.mockReset();
    handler({}, 'geolocation', cb, { requestingUrl: internal });
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('request handler falls back to wc.getURL() when details has no requestingUrl', () => {
    installPermissionHandlers(ctx);
    const handler = mocks.setPermissionRequestHandler.mock.calls[0][0] as (
      wc: unknown,
      perm: string,
      cb: (allow: boolean) => void,
      details: unknown,
    ) => void;
    const cb = vi.fn();
    handler({ getURL: () => internal }, 'media', cb, undefined);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('check handler returns the decision for the requesting origin', () => {
    installPermissionHandlers(ctx);
    const check = mocks.setPermissionCheckHandler.mock.calls[0][0] as (
      wc: unknown,
      perm: string,
      origin: string,
    ) => boolean;
    expect(check(null, 'media', internal)).toBe(true);
    expect(check(null, 'media', foreign)).toBe(false);
    expect(check(null, 'camera', internal)).toBe(false);
  });

  it('device permission handler always refuses (no WebUSB/Serial/HID picker)', () => {
    installPermissionHandlers(ctx);
    const device = mocks.setDevicePermissionHandler.mock.calls[0][0] as () => boolean;
    expect(device()).toBe(false);
  });
});
