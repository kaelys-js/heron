/**
 * notifications.test -- OS toast bridge via Electron's Notification API.
 *
 * Mocks electron's Notification + nativeImage. Tests cover:
 *   - showOsNotification: happy path (Notification.isSupported true),
 *     unsupported path (returns null), icon resolution success +
 *     failure, click handler wiring, silent + urgency + subtitle options.
 *   - notificationsSupported: passes through Notification.isSupported().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __notificationCtor = vi.fn();
const __isSupported = vi.fn();
const __notificationOn = vi.fn();
const __notificationShow = vi.fn();
const __createFromPath = vi.fn();
const __appGetAppPath = vi.fn(() => '/app/path');

vi.mock('electron', () => ({
  Notification: Object.assign(__notificationCtor, { isSupported: __isSupported }),
  app: { getAppPath: __appGetAppPath },
  nativeImage: { createFromPath: __createFromPath },
}));

beforeEach(() => {
  __notificationCtor.mockReset();
  __isSupported.mockReset();
  __notificationOn.mockReset();
  __notificationShow.mockReset();
  __createFromPath.mockReset();
  __appGetAppPath.mockReturnValue('/app/path');

  // Default mock impl: Notification ctor returns an instance with on() + show().
  __notificationCtor.mockImplementation(function () {
    return { on: __notificationOn, show: __notificationShow };
  });
  __isSupported.mockReturnValue(true);
  // Default: createFromPath returns an "empty" image -- forces icon fallback.
  __createFromPath.mockReturnValue({ isEmpty: () => true });

  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('showOsNotification', () => {
  it('returns null when Notification.isSupported() is false', async () => {
    __isSupported.mockReturnValue(false);
    const { showOsNotification } = await import('./notifications.js');
    expect(showOsNotification({ title: 't', body: 'b' })).toBe(null);
    expect(__notificationCtor).not.toHaveBeenCalled();
  });

  it('constructs a Notification with the supplied title + body when supported', async () => {
    const { showOsNotification } = await import('./notifications.js');
    const result = showOsNotification({ title: 'Heron', body: 'Hello' });
    expect(result).not.toBe(null);
    expect(__notificationCtor).toHaveBeenCalledTimes(1);
    const opts = __notificationCtor.mock.calls[0][0];
    expect(opts.title).toBe('Heron');
    expect(opts.body).toBe('Hello');
  });

  it('forwards subtitle, silent, urgency options to Notification', async () => {
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({
      title: 't',
      body: 'b',
      subtitle: 'macOS subtitle',
      silent: true,
      urgency: 'critical',
    });
    const opts = __notificationCtor.mock.calls[0][0];
    expect(opts.subtitle).toBe('macOS subtitle');
    expect(opts.silent).toBe(true);
    expect(opts.urgency).toBe('critical');
  });

  it('defaults silent=false when not supplied', async () => {
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    expect(__notificationCtor.mock.calls[0][0].silent).toBe(false);
  });

  it('attaches onClick listener when supplied', async () => {
    const { showOsNotification } = await import('./notifications.js');
    const handler = vi.fn();
    showOsNotification({ title: 't', body: 'b', onClick: handler });
    expect(__notificationOn).toHaveBeenCalledWith('click', handler);
  });

  it('does NOT attach a click listener when onClick is omitted', async () => {
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    expect(__notificationOn).not.toHaveBeenCalled();
  });

  it('calls notification.show() before returning', async () => {
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    expect(__notificationShow).toHaveBeenCalled();
  });

  it('uses a real icon when nativeImage.createFromPath returns a non-empty image', async () => {
    let attempts = 0;
    __createFromPath.mockImplementation(() => {
      attempts++;
      return { isEmpty: () => (attempts > 1 ? true : false) };
    });
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    expect(__notificationCtor.mock.calls[0][0].icon).toBeTruthy();
  });

  it('omits icon when all candidate paths are empty', async () => {
    __createFromPath.mockReturnValue({ isEmpty: () => true });
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    expect(__notificationCtor.mock.calls[0][0].icon).toBeUndefined();
  });

  it('catches createFromPath errors + falls through to the next candidate', async () => {
    let attempts = 0;
    __createFromPath.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        throw new Error('bad path');
      }
      return { isEmpty: () => true };
    });
    const { showOsNotification } = await import('./notifications.js');
    expect(() => showOsNotification({ title: 't', body: 'b' })).not.toThrow();
  });

  it('reuses the cached icon path on subsequent calls', async () => {
    // First call finds a valid icon (non-empty).
    __createFromPath.mockReturnValue({ isEmpty: () => false });
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    const initialCalls = __createFromPath.mock.calls.length;
    // Second call should re-read the cached path -- exactly ONE new
    // createFromPath invocation (line 35 of notifications.ts).
    showOsNotification({ title: 't2', body: 'b2' });
    expect(__createFromPath.mock.calls.length).toBe(initialCalls + 1);
  });

  it('skips icon altogether on subsequent calls when no candidate was valid', async () => {
    // All candidates empty -> iconPath stays ''.
    __createFromPath.mockReturnValue({ isEmpty: () => true });
    const { showOsNotification } = await import('./notifications.js');
    showOsNotification({ title: 't', body: 'b' });
    const callsAfterFirst = __createFromPath.mock.calls.length;
    showOsNotification({ title: 't2', body: 'b2' });
    // Second call should NOT iterate candidates again (iconPath === '');
    // it should also NOT read the cached path. No new createFromPath
    // invocations.
    expect(__createFromPath.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('notificationsSupported', () => {
  it('returns true when Notification.isSupported() is true', async () => {
    __isSupported.mockReturnValue(true);
    const { notificationsSupported } = await import('./notifications.js');
    expect(notificationsSupported()).toBe(true);
  });

  it('returns false when Notification.isSupported() is false', async () => {
    __isSupported.mockReturnValue(false);
    const { notificationsSupported } = await import('./notifications.js');
    expect(notificationsSupported()).toBe(false);
  });
});
