import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the auth teardown so the test asserts orchestration without booting
// better-auth (createAuthClient has network/init side effects).
const signOut = vi.fn(async () => {});
const clearLocalAuthState = vi.fn(async () => {});
vi.mock('./auth-client', () => ({ signOut, clearLocalAuthState }));

const { keysToScrub, clearClientCacheAndReset } = await import('./reset');

describe('keysToScrub (pure)', () => {
  it('removes every brand-prefixed key EXCEPT theme + backend config', () => {
    const all = [
      'heron:authed',
      'heron:bearer-token',
      'heron:cc:inbox',
      'heron:pipeline-view',
      'heron:error-queue',
      'heron:theme', // preserved (FOUC-free reload)
      'heron:tailscale-url', // preserved (device config)
      'heron:production-url', // preserved (device config)
      'sb-other-app', // unrelated origin key -- never touched
      'theme', // unprefixed -- not ours
    ];
    const scrub = keysToScrub(all);
    expect(scrub).toContain('heron:authed');
    expect(scrub).toContain('heron:cc:inbox');
    expect(scrub).toContain('heron:pipeline-view');
    expect(scrub).toContain('heron:error-queue');
    // preserved:
    expect(scrub).not.toContain('heron:theme');
    expect(scrub).not.toContain('heron:tailscale-url');
    expect(scrub).not.toContain('heron:production-url');
    // not ours:
    expect(scrub).not.toContain('sb-other-app');
    expect(scrub).not.toContain('theme');
  });
});

describe('clearClientCacheAndReset', () => {
  beforeEach(() => {
    signOut.mockClear();
    clearLocalAuthState.mockClear();
    localStorage.clear();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('signs out, tears down auth, scrubs local state, and reloads to /login', async () => {
    localStorage.setItem('heron:authed', '1');
    localStorage.setItem('heron:cc:inbox', '1');
    localStorage.setItem('heron:theme', 'dark');
    localStorage.setItem('heron:tailscale-url', 'https://x.ts.net');

    const reload = vi.fn();
    await clearClientCacheAndReset({ reload });

    expect(signOut).toHaveBeenCalledTimes(1); // server clears httpOnly cookie
    expect(clearLocalAuthState).toHaveBeenCalledTimes(1); // bearer + App Group + offline IDB
    expect(localStorage.getItem('heron:cc:inbox')).toBeNull(); // scrubbed
    expect(localStorage.getItem('heron:theme')).toBe('dark'); // preserved
    expect(localStorage.getItem('heron:tailscale-url')).toBe('https://x.ts.net'); // preserved
    expect(reload).toHaveBeenCalledWith('/login');
  });

  it('calls the Electron native-cache bridge when present', async () => {
    const clearCache = vi.fn(async () => {});
    (window as unknown as { electronAPI: { clearCache: () => Promise<void> } }).electronAPI = {
      clearCache,
    };
    await clearClientCacheAndReset({ reload: vi.fn() });
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('proceeds with local teardown even if signOut rejects (best-effort)', async () => {
    signOut.mockRejectedValueOnce(new Error('offline'));
    const reload = vi.fn();
    await clearClientCacheAndReset({ reload });
    expect(clearLocalAuthState).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith('/login');
  });
});
