/** web-contents-guard.test -- guardWebContents (applied to one fake
 *  webContents) PLUS installWebContentsGuard (app.on('web-contents-created')
 *  wiring). electron's app + shell are mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  shellOpenExternal: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { on: mocks.appOn },
  shell: { openExternal: mocks.shellOpenExternal },
}));

import { guardWebContents, installWebContentsGuard } from './web-contents-guard';

const scheme = 'heron';

/** A fake webContents capturing the open-handler + event listeners. */
function fakeContents() {
  const on: Record<string, (...a: unknown[]) => void> = {};
  let openHandler: ((d: { url: string }) => { action: string }) | undefined;
  return {
    setWindowOpenHandler: vi.fn((h: (d: { url: string }) => { action: string }) => {
      openHandler = h;
    }),
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      on[ev] = cb;
    }),
    fire: (ev: string, ...a: unknown[]) => on[ev]?.(...a),
    openWindow: (url: string) => openHandler?.({ url }),
  };
}

describe('guardWebContents', () => {
  let openExternal: ReturnType<typeof vi.fn>;
  const opts = () => ({ customScheme: scheme, devServerUrl: null, openExternal });

  beforeEach(() => {
    openExternal = vi.fn();
  });

  it('allows window.open of an internal (app scheme) url', () => {
    const c = fakeContents();
    guardWebContents(c as never, opts());
    expect(c.openWindow(`${scheme}://app/inbox`)).toEqual({ action: 'allow' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('routes an external http(s) url to the OS browser and denies the in-app window', () => {
    const c = fakeContents();
    guardWebContents(c as never, opts());
    expect(c.openWindow('https://github.com/x')).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://github.com/x');
  });

  it('denies a non-http scheme (file:/javascript:) with no external open', () => {
    const c = fakeContents();
    guardWebContents(c as never, opts());
    expect(c.openWindow('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(c.openWindow('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('blocks external will-navigate + will-redirect, allows internal nav', () => {
    const c = fakeContents();
    guardWebContents(c as never, opts());

    const ext = { preventDefault: vi.fn() };
    c.fire('will-navigate', ext, 'https://evil.example');
    expect(ext.preventDefault).toHaveBeenCalled();

    const red = { preventDefault: vi.fn() };
    c.fire('will-redirect', red, 'https://evil.example');
    expect(red.preventDefault).toHaveBeenCalled();

    const internal = { preventDefault: vi.fn() };
    c.fire('will-navigate', internal, `${scheme}://app/settings`);
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it('refuses to attach a <webview>', () => {
    const c = fakeContents();
    guardWebContents(c as never, opts());
    const ev = { preventDefault: vi.fn() };
    c.fire('will-attach-webview', ev);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('falls back to shell.openExternal when no openExternal override is given', () => {
    const c = fakeContents();
    guardWebContents(c as never, { customScheme: scheme, devServerUrl: null });
    c.openWindow('https://heron.app');
    expect(mocks.shellOpenExternal).toHaveBeenCalledWith('https://heron.app');
  });
});

describe('installWebContentsGuard', () => {
  beforeEach(() => {
    mocks.appOn.mockReset();
    mocks.shellOpenExternal.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('subscribes to web-contents-created and guards every new webContents', () => {
    installWebContentsGuard({ customScheme: scheme, devServerUrl: null });
    expect(mocks.appOn).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
    // Drive the callback with a fresh fake webContents -- it must get the guard.
    const cb = mocks.appOn.mock.calls[0][1] as (e: unknown, c: unknown) => void;
    const c = fakeContents();
    cb({}, c);
    expect(c.setWindowOpenHandler).toHaveBeenCalled();
    expect(c.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
  });
});
