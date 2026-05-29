/**
 * mdns.test -- mDNS advertise/stop wrappers around bonjour-service.
 * Source uses dynamic `await import('bonjour-service')` (not require)
 * so vi.mock intercepts cleanly. Each test sees a fresh module thanks
 * to vi.resetModules().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __publishMock = vi.fn();
const __stopMock = vi.fn();
const __BonjourCtor = vi.fn();

// Shape selector: 'both' (default), 'default-only', 'neither'. Lets tests
// reshape the mock exports without re-registering via vi.doMock (which
// leaked state into later tests).
let __mockShape: 'both' | 'default-only' | 'neither' = 'both';

vi.mock('bonjour-service', () => ({
  get Bonjour() {
    if (__mockShape === 'default-only' || __mockShape === 'neither') {
      return undefined;
    }
    return __BonjourCtor;
  },
  default: {
    get Bonjour() {
      if (__mockShape === 'neither') {
        return undefined;
      }
      return __BonjourCtor;
    },
  },
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
}));

vi.mock('./brand', () => ({
  BRAND: {
    name: 'heron',
    mdnsType: 'heron',
  },
}));

beforeEach(() => {
  __publishMock.mockReset();
  __stopMock.mockReset();
  __BonjourCtor.mockReset();
  __mockShape = 'both';
  // Use `function` not arrow so the mock supports `new` invocation.
  __BonjourCtor.mockImplementation(function () {
    return { publish: __publishMock };
  });
  __publishMock.mockReturnValue({ stop: __stopMock });
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startMdnsAdvertise', () => {
  it('constructs a Bonjour instance + calls publish with the right shape', async () => {
    const mdns = await import('./mdns.js');
    await mdns.startMdnsAdvertise({ name: 'My Heron Server', port: 5173 });
    expect(__BonjourCtor).toHaveBeenCalledTimes(1);
    expect(__publishMock).toHaveBeenCalledTimes(1);
    const args = __publishMock.mock.calls[0][0];
    expect(args.name).toBe('My Heron Server');
    expect(args.type).toBe('heron');
    expect(args.protocol).toBe('tcp');
    expect(args.port).toBe(5173);
    expect(args.txt.version).toBe('1.2.3');
    expect(args.txt.platform).toBe(process.platform);
  });

  it('logs the advertised port to console', async () => {
    const mdns = await import('./mdns.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await mdns.startMdnsAdvertise({ name: 'Test', port: 4321 });
    expect(spy).toHaveBeenCalled();
    const out = spy.mock.calls[0][0] as string;
    expect(out).toContain('4321');
    expect(out).toContain('heron');
  });

  it('catches bonjour-service constructor failures + warns', async () => {
    __BonjourCtor.mockImplementation(() => {
      throw new Error('bonjour-service missing');
    });
    const mdns = await import('./mdns.js');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mdns.startMdnsAdvertise({ name: 'Test', port: 4321 })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('catches publish failures + warns (does not throw)', async () => {
    __publishMock.mockImplementation(() => {
      throw new Error('publish failed');
    });
    const mdns = await import('./mdns.js');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mdns.startMdnsAdvertise({ name: 'Test', port: 4321 })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to mod.default.Bonjour when named export is missing', async () => {
    __mockShape = 'default-only';
    const mdns = await import('./mdns.js');
    await mdns.startMdnsAdvertise({ name: 'Test', port: 4321 });
    expect(__BonjourCtor).toHaveBeenCalledTimes(1);
    expect(__publishMock).toHaveBeenCalledTimes(1);
  });

  it('warns when neither named nor default Bonjour export is available', async () => {
    __mockShape = 'neither';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mdns = await import('./mdns.js');
    await expect(mdns.startMdnsAdvertise({ name: 'Test', port: 4321 })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    const msg = warnSpy.mock.calls[0]?.[0] as string;
    expect(msg).toMatch(/failed to advertise/i);
  });
});

describe('stopMdnsAdvertise', () => {
  it('calls advertiser.stop() when an advertiser is active', async () => {
    const mdns = await import('./mdns.js');
    await mdns.startMdnsAdvertise({ name: 'Test', port: 4321 });
    mdns.stopMdnsAdvertise();
    expect(__stopMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no advertiser is active (called before start)', async () => {
    const mdns = await import('./mdns.js');
    mdns.stopMdnsAdvertise();
    expect(__stopMock).not.toHaveBeenCalled();
  });

  it('catches errors from advertiser.stop() (e.g. already-stopped)', async () => {
    __stopMock.mockImplementation(() => {
      throw new Error('already stopped');
    });
    const mdns = await import('./mdns.js');
    await mdns.startMdnsAdvertise({ name: 'Test', port: 4321 });
    expect(() => mdns.stopMdnsAdvertise()).not.toThrow();
  });

  it('clears the advertiser reference so a second stop is a no-op', async () => {
    const mdns = await import('./mdns.js');
    await mdns.startMdnsAdvertise({ name: 'Test', port: 4321 });
    mdns.stopMdnsAdvertise();
    __stopMock.mockClear();
    mdns.stopMdnsAdvertise();
    expect(__stopMock).not.toHaveBeenCalled();
  });
});
