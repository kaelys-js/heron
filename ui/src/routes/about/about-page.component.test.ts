/**
 * /about render test.
 *
 * The About surface is what a user reads off to a bug report + the (only)
 * About source the rest of the app links to, so these pin its load-bearing
 * contract:
 *   • the build-meta line (version · commit · day) renders from the Vite
 *     defines mirrored into vitest (so a real build shows the real identity);
 *   • the external links (Website / GitHub / Report a bug / License) are all
 *     present and route through the Capacitor Browser plugin (openExternal),
 *     never an in-app navigation;
 *   • on iOS the native bundle line + device row appear from the (mocked)
 *     bridges; off iOS they're absent (asserted by the default web mock);
 *   • the 7-tap version gesture flips the SHARED devtools store (same store
 *     Settings uses) -- the unlock can't drift between the two surfaces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

// Mocked native bridges. Defaults model a WEB build (no native bundle, no
// device); individual cases re-point them to model iOS.
const getBuildInfo = vi.fn<() => Promise<{ shortVersion: string; buildNumber: string } | null>>(
  async () => null,
);
const isIos = vi.fn<() => boolean>(() => false);
vi.mock('$lib/client/native-bridge', () => ({
  getBuildInfo: () => getBuildInfo(),
  isIos: () => isIos(),
}));

const openExternal = vi.fn(async (_url: string) => {});
const copyToClipboard = vi.fn(async (_text: string) => true);
const nativeShare = vi.fn(async (_text: string, _title?: string) => false);
const deviceInfo = vi.fn(async () => ({
  platform: 'web',
  os: 'web',
  osVersion: '',
  model: '',
  manufacturer: '',
  isVirtual: false,
}));
vi.mock('$lib/client/capacitor-plugins', () => ({
  openExternal: (url: string) => openExternal(url),
  copyToClipboard: (t: string) => copyToClipboard(t),
  nativeShare: (t: string, title?: string) => nativeShare(t, title),
  deviceInfo: () => deviceInfo(),
}));

import AboutPage from './+page.svelte';
import { devtoolsEnabled, setDevtools } from '$lib/client/devtools.svelte';

describe('/about', () => {
  beforeEach(() => {
    setDevtools(false);
    getBuildInfo.mockResolvedValue(null);
    isIos.mockReturnValue(false);
    deviceInfo.mockResolvedValue({
      platform: 'web',
      os: 'web',
      osVersion: '',
      model: '',
      manufacturer: '',
      isVirtual: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    setDevtools(false);
  });

  it('renders the brand name, version pill, and build-meta line from the Vite defines', () => {
    const { getByText } = render(AboutPage);
    expect(getByText('Heron')).toBeTruthy();
    // vitest.base.ts mirrors __APP_VERSION__ (root package.json), __APP_BUILD__
    // ('testsha'), __APP_BUILD_DATE__ ('2024-01-02T...') -- so the meta line is
    // "v<version> · testsha · 2024-01-02".
    expect(getByText(/testsha/)).toBeTruthy();
    expect(getByText(/2024-01-02/)).toBeTruthy();
  });

  it('renders Website / GitHub / Report a bug / License links', () => {
    const { getByRole } = render(AboutPage);
    expect(getByRole('button', { name: /website/i })).toBeTruthy();
    expect(getByRole('button', { name: /github/i })).toBeTruthy();
    expect(getByRole('button', { name: /report a bug/i })).toBeTruthy();
    expect(getByRole('button', { name: /license/i })).toBeTruthy();
  });

  it('opens a link via the Capacitor Browser plugin, not an in-app navigation', async () => {
    const { getByRole } = render(AboutPage);
    await fireEvent.click(getByRole('button', { name: /github/i }));
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal.mock.calls[0][0]).toContain('github.com');
  });

  it('shows the native bundle line + device row on iOS (mocked bridges)', async () => {
    isIos.mockReturnValue(true);
    getBuildInfo.mockResolvedValue({ shortVersion: '0.1.0', buildNumber: '100' });
    deviceInfo.mockResolvedValue({
      platform: 'ios',
      os: 'iOS',
      osVersion: '17.5',
      model: 'iPhone15,2',
      manufacturer: 'Apple',
      isVirtual: false,
    });
    const { findByText } = render(AboutPage);
    expect(await findByText('Build 0.1.0 (100)')).toBeTruthy();
    expect(await findByText(/iOS 17\.5 · iPhone15,2/)).toBeTruthy();
  });

  it('does NOT show a native bundle / device row off iOS (web build)', () => {
    const { queryByText } = render(AboutPage);
    expect(queryByText(/^Build /)).toBeNull();
    expect(queryByText(/iOS /)).toBeNull();
  });

  it('copies a diagnostics payload that bundles the build identity', async () => {
    const { getByRole } = render(AboutPage);
    await fireEvent.click(getByRole('button', { name: /copy diagnostics/i }));
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    const payload = copyToClipboard.mock.calls[0][0];
    expect(payload).toContain('Heron');
    expect(payload).toContain('Commit testsha');
  });

  it('unlocks developer tools after 7 taps on the version, via the SHARED store', async () => {
    const { getByRole } = render(AboutPage);
    expect(devtoolsEnabled()).toBe(false);
    const version = getByRole('button', { name: /app version/i });
    for (let i = 0; i < 7; i++) {
      await fireEvent.click(version);
    }
    expect(devtoolsEnabled()).toBe(true);
    // The badge + Disable control appear once unlocked (parity with Settings).
    expect(getByRole('button', { name: /disable/i })).toBeTruthy();
  });
});
