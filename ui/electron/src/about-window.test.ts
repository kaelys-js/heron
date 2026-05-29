/**
 * about-window.test -- the pure buildAboutHtml() renderer PLUS the electron
 * glue (openAboutWindow / wireAboutIpc / readLogoDataUri). electron + node:fs
 * are mocked; the BrowserWindow mock records constructed windows and their
 * captured event handlers so the lifecycle (ready-to-show, closed, key close,
 * navigation deny) and the IPC bridge can be driven and asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories (also hoisted) can reference them without a
// temporal-dead-zone error. The MockBrowserWindow stand-in captures
// `on`/`once`/`webContents.on` handlers so tests can fire them, and records
// every constructed instance.
const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = [];
    static fromWebContents = vi.fn<(sender: unknown) => MockBrowserWindow | undefined>(
      () => undefined,
    );
    opts: Record<string, unknown>;
    destroyed = false;
    onHandlers: Record<string, (...a: unknown[]) => void> = {};
    onceHandlers: Record<string, (...a: unknown[]) => void> = {};
    wcHandlers: Record<string, (...a: unknown[]) => void> = {};
    show = vi.fn();
    focus = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
    isDestroyed = vi.fn(() => this.destroyed);
    once = vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      this.onceHandlers[ev] = cb;
    });
    on = vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      this.onHandlers[ev] = cb;
    });
    close = vi.fn(() => this.onHandlers.closed?.());
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        this.wcHandlers[ev] = cb;
      }),
    };
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      MockBrowserWindow.instances.push(this);
    }
    fireOnce(ev: string, ...args: unknown[]) {
      this.onceHandlers[ev]?.(...args);
    }
    fireWc(ev: string, ...args: unknown[]) {
      this.wcHandlers[ev]?.(...args);
    }
  }
  return {
    MockBrowserWindow,
    ipcOn: vi.fn(),
    shellOpenExternal: vi.fn(),
    clipboardWriteText: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const MockBrowserWindow = mocks.MockBrowserWindow;
const __ipcOn = mocks.ipcOn;
const __shellOpenExternal = mocks.shellOpenExternal;
const __clipboardWriteText = mocks.clipboardWriteText;
const __readFileSync = mocks.readFileSync;

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
  ipcMain: { on: mocks.ipcOn },
  shell: { openExternal: mocks.shellOpenExternal },
  clipboard: { writeText: mocks.clipboardWriteText },
}));

vi.mock('node:fs', () => ({ readFileSync: mocks.readFileSync }));

import { buildAboutHtml } from './about-window';
import type { AboutInfo } from './about-window';

function info(overrides: Partial<AboutInfo> = {}): AboutInfo {
  return {
    displayName: 'Heron',
    tagline: 'Stand still. Strike well.',
    description: 'A local-first job-search platform.',
    version: '1.4.2',
    versions: { electron: '39.8.10', chromium: '140.0.1', node: '22.22.1' },
    copyright: '© 2026 Heron contributors.',
    links: [
      { label: 'Website', url: 'https://heron.app' },
      { label: 'GitHub', url: 'https://github.com/kaelys-js/heron' },
      { label: 'Report a bug', url: 'https://github.com/kaelys-js/heron/issues/new' },
    ],
    colors: {
      accent: '#c89b4a',
      primary: '#4a5b6d',
      darkBg: '#0e1014',
      darkSurface: '#14181f',
      textOnDark: '#e8eaed',
    },
    ...overrides,
  };
}

describe('buildAboutHtml', () => {
  it('renders the brand name, tagline, version, description and copyright', () => {
    const html = buildAboutHtml(info());
    expect(html).toContain('Heron');
    expect(html).toContain('Stand still. Strike well.');
    expect(html).toContain('1.4.2');
    expect(html).toContain('A local-first job-search platform.');
    expect(html).toContain('© 2026 Heron contributors.');
  });

  it('renders every link as a bridge-wired button (label + data-href)', () => {
    const html = buildAboutHtml(info());
    for (const l of info().links) {
      expect(html).toContain(l.label);
      expect(html).toContain(`data-href="${l.url}"`);
    }
  });

  it('renders the runtime versions (bug-report detail)', () => {
    const html = buildAboutHtml(info());
    expect(html).toContain('39.8.10');
    expect(html).toContain('140.0.1');
    expect(html).toContain('22.22.1');
  });

  it('puts a multi-line copy-version payload on the copy button', () => {
    const html = buildAboutHtml(info());
    // The data-copy attribute holds the newline-joined version block.
    expect(html).toMatch(/data-copy="[^"]*Heron 1\.4\.2[^"]*Electron 39\.8\.10/);
  });

  it('includes the backend line in the copy payload when backendUrl is given', () => {
    const html = buildAboutHtml(info({ backendUrl: 'http://localhost:5173' }));
    expect(html).toMatch(/data-copy="[^"]*Backend http:\/\/localhost:5173/);
  });

  it('escapes HTML in interpolated values (no raw tag injection)', () => {
    const html = buildAboutHtml(info({ displayName: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('embeds the logo as an <img> when a data URI is provided', () => {
    const html = buildAboutHtml(info({ logoDataUri: 'data:image/png;base64,AAAA' }));
    expect(html).toContain('<img class="logo" src="data:image/png;base64,AAAA"');
    // The text-fallback ELEMENT must not be rendered (the .logo--text CSS rule
    // always exists in <style>, so assert on the markup, not the class name).
    expect(html).not.toContain('<div class="logo logo--text"');
  });

  it('falls back to a wordmark monogram when no logo is provided', () => {
    const html = buildAboutHtml(info({ logoDataUri: undefined }));
    expect(html).toContain('<div class="logo logo--text"');
    expect(html).not.toContain('<img class="logo"');
  });

  it('shows the backend line only when a backendUrl is given', () => {
    expect(buildAboutHtml(info({ backendUrl: 'http://localhost:5173' }))).toContain(
      'http://localhost:5173',
    );
    expect(buildAboutHtml(info())).not.toContain('class="backend"');
  });

  it('wires the page to the named bridge global', () => {
    const html = buildAboutHtml(info({ bridge: '__aboutBridge__' }));
    expect(html).toContain('window["__aboutBridge__"]');
  });

  it('falls back to the default bridge global when none is given', () => {
    const html = buildAboutHtml(info());
    expect(html).toContain('window["__aboutBridge__"]');
  });

  it('applies the brand palette as CSS custom properties', () => {
    const html = buildAboutHtml(info());
    expect(html).toContain('--accent: #c89b4a');
    expect(html).toContain('--bg: #0e1014');
  });
});

describe('openAboutWindow + wireAboutIpc (electron glue)', () => {
  let openAboutWindow: typeof import('./about-window').openAboutWindow;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    MockBrowserWindow.instances = [];
    MockBrowserWindow.fromWebContents = vi.fn(() => undefined);
    // resetModules clears the module-level aboutWindow/ipcWired singletons.
    ({ openAboutWindow } = await import('./about-window.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function open(parentSentinel?: unknown) {
    return openAboutWindow({
      info: info(),
      brandName: 'heron',
      preloadPath: '/app/about-preload.js',
      parent: parentSentinel as never,
    });
  }

  it('creates a locked-down, frameless BrowserWindow and loads the About HTML', () => {
    open();
    expect(MockBrowserWindow.instances).toHaveLength(1);
    const win = MockBrowserWindow.instances[0];
    expect(win.opts.frame).toBe(false);
    expect(win.opts.resizable).toBe(false);
    const wp = win.opts.webPreferences as Record<string, unknown>;
    expect(wp.contextIsolation).toBe(true);
    expect(wp.nodeIntegration).toBe(false);
    // sandbox MUST be false so the preload can require('./brand').
    expect(wp.sandbox).toBe(false);
    expect(wp.preload).toBe('/app/about-preload.js');
    expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining('data:text/html'));
  });

  it('focuses the existing window instead of opening a second one', () => {
    const first = open();
    const second = open();
    expect(second).toBe(first);
    expect(MockBrowserWindow.instances).toHaveLength(1);
    expect(first.show).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
  });

  it('opens a fresh window after the previous one is destroyed (no closed event)', () => {
    const first = open();
    first.destroyed = true;
    const second = open();
    expect(second).not.toBe(first);
    expect(MockBrowserWindow.instances).toHaveLength(2);
  });

  it('opens a fresh window after the previous one fired closed', () => {
    const first = open();
    first.onHandlers.closed?.(); // clears the singleton
    const second = open();
    expect(second).not.toBe(first);
    expect(MockBrowserWindow.instances).toHaveLength(2);
  });

  it('shows + focuses on ready-to-show', () => {
    const win = open();
    win.show.mockClear();
    win.focus.mockClear();
    win.fireOnce('ready-to-show');
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('denies popups and blocks navigation (defence-in-depth)', () => {
    const win = open();
    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0][0] as () => unknown;
    expect(openHandler()).toEqual({ action: 'deny' });
    const navEvent = { preventDefault: vi.fn() };
    win.fireWc('will-navigate', navEvent);
    expect(navEvent.preventDefault).toHaveBeenCalled();
  });

  it('closes the window on Escape and ignores non-keyDown / other keys', () => {
    const win = open();
    const escEvent = { preventDefault: vi.fn() };
    win.fireWc('before-input-event', escEvent, { type: 'keyDown', key: 'Escape' });
    expect(escEvent.preventDefault).toHaveBeenCalled();
    expect(win.close).toHaveBeenCalled();

    win.close.mockClear();
    win.fireWc('before-input-event', { preventDefault: vi.fn() }, { type: 'keyUp', key: 'Escape' });
    win.fireWc('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'a' });
    expect(win.close).not.toHaveBeenCalled();
  });

  it('closes the window on Cmd/Ctrl+W', () => {
    const win = open();
    const ev = { preventDefault: vi.fn() };
    win.fireWc('before-input-event', ev, { type: 'keyDown', key: 'W', meta: true });
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(win.close).toHaveBeenCalled();
  });

  it('does not close an already-destroyed window on key-close', () => {
    const win = open();
    win.destroyed = true;
    win.close.mockClear();
    win.fireWc(
      'before-input-event',
      { preventDefault: vi.fn() },
      { type: 'keyDown', key: 'Escape' },
    );
    expect(win.close).not.toHaveBeenCalled();
  });

  it('registers the three brand-namespaced IPC channels exactly once', () => {
    open();
    const channels = __ipcOn.mock.calls.map((c) => c[0]);
    expect(channels).toContain('heron:about:open-external');
    expect(channels).toContain('heron:about:copy');
    expect(channels).toContain('heron:about:close');
    // Re-opening (after close) must NOT re-register: wireAboutIpc is idempotent.
    MockBrowserWindow.instances[0].onHandlers.closed?.();
    __ipcOn.mockClear();
    open();
    expect(__ipcOn).not.toHaveBeenCalled();
  });

  it('open-external IPC opens only http(s) urls via shell', () => {
    open();
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:about:open-external')![1];
    handler({}, 'https://heron.app');
    expect(__shellOpenExternal).toHaveBeenCalledWith('https://heron.app');
    __shellOpenExternal.mockClear();
    handler({}, 'javascript:alert(1)'); // not http(s)
    handler({}, 42); // not a string
    expect(__shellOpenExternal).not.toHaveBeenCalled();
  });

  it('copy IPC writes strings to the clipboard and ignores non-strings', () => {
    open();
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:about:copy')![1];
    handler({}, 'Heron 1.4.2');
    expect(__clipboardWriteText).toHaveBeenCalledWith('Heron 1.4.2');
    __clipboardWriteText.mockClear();
    handler({}, { not: 'a string' });
    expect(__clipboardWriteText).not.toHaveBeenCalled();
  });

  it('close IPC closes the sender window when resolvable', () => {
    open();
    const closeSpy = vi.fn();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: closeSpy }) as never);
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:about:close')![1];
    handler({ sender: {} });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('close IPC is a no-op when the sender window is gone', () => {
    open();
    MockBrowserWindow.fromWebContents = vi.fn(() => undefined);
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:about:close')![1];
    expect(() => handler({ sender: {} })).not.toThrow();
  });
});

describe('readLogoDataUri', () => {
  let readLogoDataUri: typeof import('./about-window').readLogoDataUri;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ readLogoDataUri } = await import('./about-window.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a data: URI when the icon file is readable', () => {
    __readFileSync.mockReturnValue(Buffer.from('PNGDATA'));
    const uri = readLogoDataUri('/app');
    expect(uri).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
  });

  it('returns undefined when the icon file is missing', () => {
    __readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readLogoDataUri('/app')).toBeUndefined();
  });
});
