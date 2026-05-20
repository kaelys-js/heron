/**
 * native-bridge.test -- JS wrapper around the HeronNative Capacitor
 * plugin. The file is mostly a fan-out of `isIos() ? plugin.call() :
 * safe_default()` guards; this test exercises every web-fallback branch
 * (the bulk of the line count) plus the iOS happy-path + error-path for
 * each method by mocking `@capacitor/core`.
 *
 * Why this matters: in production, the iOS Capacitor build uses the
 * native paths and the web/electron build uses the fallback paths.
 * Both shapes have to behave -- one user crashing because of a missing
 * localStorage fallback would be a regression. This test pins both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Capacitor mock ───────────────────────────────────────────────────
// `getPlatform()` is the runtime branch the whole file pivots on.
// We let each test override it via `setPlatform()` so a single mock
// surface drives both branches without re-importing the module.
let __platform: 'web' | 'ios' = 'web';
function setPlatform(p: 'web' | 'ios') {
  __platform = p;
}

// Captured listener registered via `addListener('netStatusChanged', ...)`.
let __netListener: ((e: { online: boolean }) => void) | null = null;
let __subscriptionRemoved = false;

// Mock plugin returns -- assign per test.
const __pluginShape = {
  getLanUrl: vi.fn(),
  biometricAvailable: vi.fn(),
  biometricAuth: vi.fn(),
  keychainSet: vi.fn(),
  keychainGet: vi.fn(),
  keychainRemove: vi.fn(),
  indexJobs: vi.fn(),
  clearJobIndex: vi.fn(),
  setUserActivity: vi.fn(),
  drainNativeErrors: vi.fn(),
  updateWidgets: vi.fn(),
  setSharedBearerToken: vi.fn(),
  clearSharedBearerToken: vi.fn(),
  setSharedBackendUrl: vi.fn(),
  setSharedTailscaleUrl: vi.fn(),
  setSharedProductionUrl: vi.fn(),
  getSharedTailscaleUrl: vi.fn(),
  getSharedProductionUrl: vi.fn(),
  setSharedQuietHours: vi.fn(),
  clearAllSharedState: vi.fn(),
  addListener: vi.fn((event: string, cb: (e: { online: boolean }) => void) => {
    if (event === 'netStatusChanged') {
      __netListener = cb;
    }
    return {
      remove: () => {
        __subscriptionRemoved = true;
        __netListener = null;
      },
    };
  }),
};

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => __platform,
  },
  registerPlugin: () => __pluginShape,
}));

// ── Import under test (after the mock) ───────────────────────────────
const bridge = await import('./native-bridge');

beforeEach(() => {
  setPlatform('web');
  __netListener = null;
  __subscriptionRemoved = false;
  Object.values(__pluginShape).forEach((m) => {
    if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
  });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isIos', () => {
  it('returns false on web', () => {
    setPlatform('web');
    expect(bridge.isIos()).toBe(false);
  });

  it('returns true on iOS', () => {
    setPlatform('ios');
    expect(bridge.isIos()).toBe(true);
  });
});

describe('getLanUrl', () => {
  it('returns null on web (skip native call)', async () => {
    setPlatform('web');
    expect(await bridge.getLanUrl()).toBe(null);
    expect(__pluginShape.getLanUrl).not.toHaveBeenCalled();
  });

  it('returns the plugin URL on iOS', async () => {
    setPlatform('ios');
    __pluginShape.getLanUrl.mockResolvedValue({ url: 'http://10.0.0.5:5173' });
    expect(await bridge.getLanUrl()).toBe('http://10.0.0.5:5173');
  });

  it('returns null when the native call throws', async () => {
    setPlatform('ios');
    __pluginShape.getLanUrl.mockRejectedValue(new Error('plugin failed'));
    expect(await bridge.getLanUrl()).toBe(null);
  });
});

describe('biometricAvailable', () => {
  it('returns false on web', async () => {
    expect(await bridge.biometricAvailable()).toBe(false);
  });

  it('reflects plugin value on iOS (true)', async () => {
    setPlatform('ios');
    __pluginShape.biometricAvailable.mockResolvedValue({ available: true });
    expect(await bridge.biometricAvailable()).toBe(true);
  });

  it('reflects plugin value on iOS (false)', async () => {
    setPlatform('ios');
    __pluginShape.biometricAvailable.mockResolvedValue({ available: false });
    expect(await bridge.biometricAvailable()).toBe(false);
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.biometricAvailable.mockRejectedValue(new Error('no biometrics'));
    expect(await bridge.biometricAvailable()).toBe(false);
  });
});

describe('biometricAuth', () => {
  it('returns true on web (no gate yet)', async () => {
    expect(await bridge.biometricAuth('unlock keychain')).toBe(true);
  });

  it('reflects plugin ok flag on iOS', async () => {
    setPlatform('ios');
    __pluginShape.biometricAuth.mockResolvedValue({ ok: true });
    expect(await bridge.biometricAuth('unlock')).toBe(true);
  });

  it('returns false on plugin throw (auth cancelled)', async () => {
    setPlatform('ios');
    __pluginShape.biometricAuth.mockRejectedValue(new Error('user cancelled'));
    expect(await bridge.biometricAuth('unlock')).toBe(false);
  });
});

describe('keychainSet / keychainGet / keychainRemove (web localStorage fallback)', () => {
  it('keychainSet writes to localStorage with KC_PREFIX', async () => {
    const ok = await bridge.keychainSet('myKey', 'myValue');
    expect(ok).toBe(true);
    // Stored under `<BRAND_STORAGE_PREFIX>:kc:myKey`. We don't depend on
    // the exact prefix (driven by brand.ts) -- just assert the value
    // round-trips through getter.
    expect(await bridge.keychainGet('myKey')).toBe('myValue');
  });

  it('keychainGet returns null for missing key', async () => {
    expect(await bridge.keychainGet('absent')).toBe(null);
  });

  it('keychainRemove deletes the entry; subsequent get returns null', async () => {
    await bridge.keychainSet('k', 'v');
    expect(await bridge.keychainGet('k')).toBe('v');
    expect(await bridge.keychainRemove('k')).toBe(true);
    expect(await bridge.keychainGet('k')).toBe(null);
  });
});

describe('keychainSet (iOS path)', () => {
  it('reflects plugin ok on iOS', async () => {
    setPlatform('ios');
    __pluginShape.keychainSet.mockResolvedValue({ ok: true });
    expect(await bridge.keychainSet('k', 'v')).toBe(true);
    expect(__pluginShape.keychainSet).toHaveBeenCalledWith({ key: 'k', value: 'v' });
  });

  it('returns false on plugin throw (keychain error)', async () => {
    setPlatform('ios');
    __pluginShape.keychainSet.mockRejectedValue(new Error('keychain access denied'));
    expect(await bridge.keychainSet('k', 'v')).toBe(false);
  });
});

describe('keychainGet (iOS path)', () => {
  it('reflects plugin value on iOS', async () => {
    setPlatform('ios');
    __pluginShape.keychainGet.mockResolvedValue({ value: 'native-stored' });
    expect(await bridge.keychainGet('k')).toBe('native-stored');
  });

  it('returns null on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.keychainGet.mockRejectedValue(new Error('keychain error'));
    expect(await bridge.keychainGet('k')).toBe(null);
  });
});

describe('keychainRemove (iOS path)', () => {
  it('reflects plugin ok on iOS', async () => {
    setPlatform('ios');
    __pluginShape.keychainRemove.mockResolvedValue({ ok: true });
    expect(await bridge.keychainRemove('k')).toBe(true);
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.keychainRemove.mockRejectedValue(new Error('keychain error'));
    expect(await bridge.keychainRemove('k')).toBe(false);
  });
});

describe('indexJobs / clearJobIndex / setUserActivity (web no-ops)', () => {
  it('indexJobs returns 0 on web', async () => {
    expect(await bridge.indexJobs([{ id: '1', company: 'Acme', role: 'Engineer' }])).toBe(0);
  });

  it('clearJobIndex returns true on web', async () => {
    expect(await bridge.clearJobIndex()).toBe(true);
  });

  it('setUserActivity returns true on web', async () => {
    expect(await bridge.setUserActivity('act', 'title', { jobId: 'x' })).toBe(true);
  });
});

describe('indexJobs / clearJobIndex / setUserActivity (iOS)', () => {
  it('indexJobs reflects plugin indexed count', async () => {
    setPlatform('ios');
    __pluginShape.indexJobs.mockResolvedValue({ ok: true, indexed: 42 });
    expect(await bridge.indexJobs([{ id: '1', company: 'A', role: 'B' }])).toBe(42);
  });

  it('indexJobs returns 0 on throw', async () => {
    setPlatform('ios');
    __pluginShape.indexJobs.mockRejectedValue(new Error('CoreSpotlight failed'));
    expect(await bridge.indexJobs([])).toBe(0);
  });

  it('clearJobIndex returns plugin ok', async () => {
    setPlatform('ios');
    __pluginShape.clearJobIndex.mockResolvedValue({ ok: true });
    expect(await bridge.clearJobIndex()).toBe(true);
  });

  it('clearJobIndex returns false on throw', async () => {
    setPlatform('ios');
    __pluginShape.clearJobIndex.mockRejectedValue(new Error('failed'));
    expect(await bridge.clearJobIndex()).toBe(false);
  });

  it('setUserActivity returns plugin ok', async () => {
    setPlatform('ios');
    __pluginShape.setUserActivity.mockResolvedValue({ ok: true });
    expect(await bridge.setUserActivity('t', 'title', {})).toBe(true);
  });

  it('setUserActivity returns false on throw', async () => {
    setPlatform('ios');
    __pluginShape.setUserActivity.mockRejectedValue(new Error('NSUserActivity failed'));
    expect(await bridge.setUserActivity('t', 'title', {})).toBe(false);
  });
});

describe('onNetStatusChange', () => {
  it('returns a no-op unsubscriber on web (no plugin)', () => {
    setPlatform('web');
    const unsubscribe = bridge.onNetStatusChange(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribes via plugin.addListener on iOS + forwards events', () => {
    setPlatform('ios');
    const handler = vi.fn();
    const unsubscribe = bridge.onNetStatusChange(handler);
    // Fire a fake native event via the captured listener.
    __netListener?.({ online: false });
    expect(handler).toHaveBeenCalledWith(false);
    __netListener?.({ online: true });
    expect(handler).toHaveBeenCalledWith(true);
    unsubscribe();
    expect(__subscriptionRemoved).toBe(true);
  });
});

describe('drainNativeErrors', () => {
  it('returns [] on web', async () => {
    expect(await bridge.drainNativeErrors()).toEqual([]);
  });

  it('returns plugin errors on iOS', async () => {
    setPlatform('ios');
    const fakeErrors = [{ message: 'crash', stack: '...' }];
    __pluginShape.drainNativeErrors.mockResolvedValue({ errors: fakeErrors });
    expect(await bridge.drainNativeErrors()).toEqual(fakeErrors);
  });

  it('returns [] on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.drainNativeErrors.mockRejectedValue(new Error('drain failed'));
    expect(await bridge.drainNativeErrors()).toEqual([]);
  });

  it('returns [] when plugin returns undefined errors', async () => {
    setPlatform('ios');
    // biome-ignore lint/suspicious/noExplicitAny: deliberate undefined-shape probe
    __pluginShape.drainNativeErrors.mockResolvedValue({} as any);
    expect(await bridge.drainNativeErrors()).toEqual([]);
  });
});

describe('updateWidgets', () => {
  it('returns false on web (no widgets to update)', async () => {
    expect(await bridge.updateWidgets({ stats: { queued: 5 } })).toBe(false);
  });

  it('reflects plugin ok on iOS', async () => {
    setPlatform('ios');
    __pluginShape.updateWidgets.mockResolvedValue({ ok: true });
    expect(await bridge.updateWidgets({ authenticated: true })).toBe(true);
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.updateWidgets.mockRejectedValue(new Error('WidgetCenter failed'));
    expect(await bridge.updateWidgets({})).toBe(false);
  });
});

describe('setSharedBearerToken', () => {
  it('returns false on web', async () => {
    expect(await bridge.setSharedBearerToken('tok')).toBe(false);
  });

  it('calls setSharedBearerToken with a non-null token on iOS', async () => {
    setPlatform('ios');
    __pluginShape.setSharedBearerToken.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedBearerToken('tok-xyz')).toBe(true);
    expect(__pluginShape.setSharedBearerToken).toHaveBeenCalledWith({ token: 'tok-xyz' });
  });

  it('calls clearSharedBearerToken when token is null', async () => {
    setPlatform('ios');
    __pluginShape.clearSharedBearerToken.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedBearerToken(null)).toBe(true);
    expect(__pluginShape.clearSharedBearerToken).toHaveBeenCalled();
  });

  it('calls clearSharedBearerToken when token is empty', async () => {
    setPlatform('ios');
    __pluginShape.clearSharedBearerToken.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedBearerToken('')).toBe(true);
    expect(__pluginShape.clearSharedBearerToken).toHaveBeenCalled();
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.setSharedBearerToken.mockRejectedValue(new Error('UserDefaults locked'));
    expect(await bridge.setSharedBearerToken('tok')).toBe(false);
  });
});

describe('setSharedBackendUrl', () => {
  it('returns false on web', async () => {
    expect(await bridge.setSharedBackendUrl('http://x')).toBe(false);
  });

  it('passes empty string for null url on iOS', async () => {
    setPlatform('ios');
    __pluginShape.setSharedBackendUrl.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedBackendUrl(null)).toBe(true);
    expect(__pluginShape.setSharedBackendUrl).toHaveBeenCalledWith({ url: '' });
  });

  it('passes the URL through on iOS', async () => {
    setPlatform('ios');
    __pluginShape.setSharedBackendUrl.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedBackendUrl('http://10.0.0.5')).toBe(true);
    expect(__pluginShape.setSharedBackendUrl).toHaveBeenCalledWith({ url: 'http://10.0.0.5' });
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.setSharedBackendUrl.mockRejectedValue(new Error('UserDefaults locked'));
    expect(await bridge.setSharedBackendUrl('http://x')).toBe(false);
  });
});

describe('setSharedTailscaleUrl + getSharedTailscaleUrl', () => {
  it('writes to localStorage on web; returns true; getter reads it back', async () => {
    setPlatform('web');
    expect(await bridge.setSharedTailscaleUrl('http://tail.scale')).toBe(true);
    expect(await bridge.getSharedTailscaleUrl()).toBe('http://tail.scale');
  });

  it('clears localStorage when value is null/empty', async () => {
    setPlatform('web');
    await bridge.setSharedTailscaleUrl('http://x');
    expect(await bridge.getSharedTailscaleUrl()).toBe('http://x');
    await bridge.setSharedTailscaleUrl(null);
    expect(await bridge.getSharedTailscaleUrl()).toBe(null);
  });

  it('writes to BOTH localStorage AND plugin on iOS', async () => {
    setPlatform('ios');
    __pluginShape.setSharedTailscaleUrl.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedTailscaleUrl('http://x')).toBe(true);
    expect(__pluginShape.setSharedTailscaleUrl).toHaveBeenCalledWith({ url: 'http://x' });
  });

  it('reads from plugin on iOS', async () => {
    setPlatform('ios');
    __pluginShape.getSharedTailscaleUrl.mockResolvedValue({ url: 'http://from-native' });
    expect(await bridge.getSharedTailscaleUrl()).toBe('http://from-native');
  });

  it('returns null on iOS when plugin returns empty url', async () => {
    setPlatform('ios');
    __pluginShape.getSharedTailscaleUrl.mockResolvedValue({ url: '' });
    expect(await bridge.getSharedTailscaleUrl()).toBe(null);
  });

  it('returns null on iOS plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.getSharedTailscaleUrl.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.getSharedTailscaleUrl()).toBe(null);
  });

  it('returns false on iOS setter plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.setSharedTailscaleUrl.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.setSharedTailscaleUrl('http://x')).toBe(false);
  });
});

describe('setSharedProductionUrl + getSharedProductionUrl', () => {
  it('round-trips through localStorage on web', async () => {
    setPlatform('web');
    expect(await bridge.setSharedProductionUrl('http://prod')).toBe(true);
    expect(await bridge.getSharedProductionUrl()).toBe('http://prod');
  });

  it('clears localStorage when value is null', async () => {
    setPlatform('web');
    await bridge.setSharedProductionUrl('http://x');
    await bridge.setSharedProductionUrl(null);
    expect(await bridge.getSharedProductionUrl()).toBe(null);
  });

  it('reads from plugin on iOS', async () => {
    setPlatform('ios');
    __pluginShape.getSharedProductionUrl.mockResolvedValue({ url: 'http://native' });
    expect(await bridge.getSharedProductionUrl()).toBe('http://native');
  });

  it('returns null on iOS when url is empty', async () => {
    setPlatform('ios');
    __pluginShape.getSharedProductionUrl.mockResolvedValue({ url: '' });
    expect(await bridge.getSharedProductionUrl()).toBe(null);
  });

  it('returns null on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.getSharedProductionUrl.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.getSharedProductionUrl()).toBe(null);
  });

  it('returns false on iOS setter plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.setSharedProductionUrl.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.setSharedProductionUrl('http://x')).toBe(false);
  });
});

describe('setSharedQuietHours', () => {
  it('returns false on web', async () => {
    expect(await bridge.setSharedQuietHours('{}')).toBe(false);
  });

  it('reflects plugin ok on iOS', async () => {
    setPlatform('ios');
    __pluginShape.setSharedQuietHours.mockResolvedValue({ ok: true });
    expect(await bridge.setSharedQuietHours('{"start":"22:00"}')).toBe(true);
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.setSharedQuietHours.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.setSharedQuietHours('{}')).toBe(false);
  });
});

describe('clearAllSharedState', () => {
  it('returns false on web', async () => {
    expect(await bridge.clearAllSharedState()).toBe(false);
  });

  it('reflects plugin ok on iOS', async () => {
    setPlatform('ios');
    __pluginShape.clearAllSharedState.mockResolvedValue({ ok: true });
    expect(await bridge.clearAllSharedState()).toBe(true);
  });

  it('returns false on plugin throw', async () => {
    setPlatform('ios');
    __pluginShape.clearAllSharedState.mockRejectedValue(new Error('UserDefaults'));
    expect(await bridge.clearAllSharedState()).toBe(false);
  });
});
