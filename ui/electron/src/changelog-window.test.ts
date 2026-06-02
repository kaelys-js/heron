/**
 * changelog-window.test -- the pure buildChangelogHtml() + renderReleaseNotes()
 * renderers PLUS the electron glue (openChangelogWindow / wireChangelogIpc /
 * readLogoDataUri). electron + node:fs are mocked; the BrowserWindow mock
 * records constructed windows and their captured event handlers so the
 * lifecycle (ready-to-show, closed, key close, navigation deny) and the IPC
 * bridge (open-external / download / install / close) can be driven + asserted.
 *
 * The renderReleaseNotes tests are the security spine: release notes can arrive
 * from electron-updater off the network, so a malicious note MUST NOT produce a
 * raw <script>/<img onerror>/javascript: link, while the markdown whitelist
 * (### / - / ** / `code` / bare url) must still render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    readFileSync: vi.fn(),
    watch: vi.fn(() => ({ close: vi.fn() })),
  };
});

const MockBrowserWindow = mocks.MockBrowserWindow;
const __ipcOn = mocks.ipcOn;
const __shellOpenExternal = mocks.shellOpenExternal;
const __readFileSync = mocks.readFileSync;
const __watch = mocks.watch;

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
  ipcMain: { on: mocks.ipcOn },
  shell: { openExternal: mocks.shellOpenExternal },
  app: { isPackaged: false },
}));

vi.mock('node:fs', () => ({ readFileSync: mocks.readFileSync, watch: mocks.watch }));

import { buildChangelogHtml, renderReleaseNotes } from './changelog-window';
import type { ChangelogInfo, ChangelogMode } from './changelog-window';

function info(overrides: Partial<ChangelogInfo> = {}): ChangelogInfo {
  return {
    displayName: 'Heron',
    version: '1.5.0',
    mode: 'available',
    notesHtml: '<p>Some notes.</p>',
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

describe('buildChangelogHtml', () => {
  it('renders the "What\'s New" heading, version pill and the supplied notes html', () => {
    const html = buildChangelogHtml(info({ notesHtml: '<p>Fixed the bug.</p>' }));
    expect(html).toContain("What's New");
    expect(html).toContain('1.5.0');
    expect(html).toContain('<p>Fixed the bug.</p>');
  });

  it("mode 'available' renders Download + Later", () => {
    const html = buildChangelogHtml(info({ mode: 'available' }));
    expect(html).toContain('data-action="download"');
    expect(html).toContain('>Download<');
    expect(html).toContain('data-action="close"');
    expect(html).toContain('>Later<');
    expect(html).not.toContain('data-action="install"');
  });

  it("mode 'downloaded' renders Restart & Update + Later", () => {
    const html = buildChangelogHtml(info({ mode: 'downloaded' }));
    expect(html).toContain('data-action="install"');
    expect(html).toContain('Restart &amp; Update');
    expect(html).toContain('data-action="close"');
    expect(html).not.toContain('data-action="download"');
  });

  it("mode 'downloaded' adds a Skip-this-version button only when showSkip is set", () => {
    // WHY: an auto-downloaded update re-fires update-downloaded on every launch
    // until the user restarts; "Skip this version" is the user's escape hatch to
    // suppress THIS version for good. It must be present only in 'downloaded'
    // (not 'available'/'current') and only when the caller opts in.
    const withSkip = buildChangelogHtml(info({ mode: 'downloaded', showSkip: true }));
    expect(withSkip).toContain('data-action="skip"');
    expect(withSkip).toContain('Skip this version');
    const withoutSkip = buildChangelogHtml(info({ mode: 'downloaded', showSkip: false }));
    expect(withoutSkip).not.toContain('data-action="skip"');
    // showSkip is ignored outside 'downloaded'.
    expect(buildChangelogHtml(info({ mode: 'available', showSkip: true }))).not.toContain(
      'data-action="skip"',
    );
    expect(buildChangelogHtml(info({ mode: 'current', showSkip: true }))).not.toContain(
      'data-action="skip"',
    );
  });

  it("mode 'current' renders a single Close button", () => {
    const html = buildChangelogHtml(info({ mode: 'current' }));
    expect(html).toContain('data-action="close"');
    expect(html).toContain('>Close<');
    expect(html).not.toContain('data-action="download"');
    expect(html).not.toContain('data-action="install"');
  });

  it('escapes the version + displayName (no raw tag injection)', () => {
    const html = buildChangelogHtml(
      info({ version: '<img src=x onerror=alert(1)>', displayName: '<b>X</b>' }),
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<b>X</b>');
  });

  it('embeds the logo as an <img> when a data URI is provided, else a monogram', () => {
    const withLogo = buildChangelogHtml(info({ logoDataUri: 'data:image/png;base64,AAAA' }));
    expect(withLogo).toContain(
      '<img class="cl-logo cl-logo--img" src="data:image/png;base64,AAAA"',
    );
    expect(withLogo).not.toContain('<div class="cl-logo cl-logo--text"');
    const noLogo = buildChangelogHtml(info({ logoDataUri: undefined }));
    expect(noLogo).toContain('<div class="cl-logo cl-logo--text"');
  });

  it('shows a friendly empty state when notesHtml is blank', () => {
    expect(buildChangelogHtml(info({ notesHtml: '   ' }))).toContain('No release notes');
  });

  it('wires the page to the named bridge global (default + override)', () => {
    expect(buildChangelogHtml(info())).toContain('window["__changelogBridge__"]');
    expect(buildChangelogHtml(info({ bridge: '__clBridge__' }))).toContain(
      'window["__clBridge__"]',
    );
  });

  it('applies the brand palette as CSS custom properties', () => {
    const html = buildChangelogHtml(info());
    expect(html).toContain('--accent: #c89b4a');
    expect(html).toContain('--bg: #0e1014');
  });

  it('embeds a strict in-document CSP meta (belt to renderReleaseNotes suspenders)', () => {
    const html = buildChangelogHtml(info());
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('img-src data:');
    expect(html).toContain("script-src 'unsafe-inline'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-ancestors 'none'");
  });

  it('places the close button on the right by default, left on macOS (closeOnLeft)', () => {
    expect(buildChangelogHtml(info())).toContain('right: 14px');
    const mac = buildChangelogHtml(info({ closeOnLeft: true }));
    expect(mac).toContain('left: 14px');
    expect(mac).not.toContain('right: 14px');
  });
});

describe('renderReleaseNotes -- sanitisation (the security spine)', () => {
  it('escapes a malicious note: no raw <script>, <img onerror>, or javascript: link', () => {
    const malicious = [
      '<script>steal()</script>',
      '<img src=x onerror=alert(1)>',
      '[click me](javascript:alert(1))',
      '- safe bullet',
    ].join('\n');
    const html = renderReleaseNotes(malicious);
    // No raw dangerous markup survives -- the tags are entity-escaped, so the
    // <script>/<img> never become live elements (the onerror= text remains only
    // INSIDE the escaped &lt;img ...&gt; string, where it can't fire).
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<a\s/i);
    // javascript: is not a bare https:// url, so it never becomes a link button.
    expect(html).not.toContain('data-href="javascript:');
    expect(html).not.toContain('href="javascript:');
    // The escaped forms are present (proof it was rendered, not dropped).
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); // escaped, inert
    // The legit markdown around it still rendered.
    expect(html).toContain('<li>safe bullet</li>');
  });

  it('renders ### headings, - bullets, **bold**, and `code`', () => {
    const html = renderReleaseNotes('### Added\n- a **bold** item\n- a `code` item');
    expect(html).toContain('<h3>Added</h3>');
    expect(html).toContain('<li>a <strong>bold</strong> item</li>');
    expect(html).toContain('<li>a <code>code</code> item</li>');
  });

  it('turns a bare https:// url into a bridge-routed button, never a raw <a>', () => {
    const html = renderReleaseNotes('See https://heron.app/changelog for details.');
    expect(html).toContain('data-href="https://heron.app/changelog"');
    expect(html).toContain('class="cl-link"');
    expect(html).not.toMatch(/<a\s/i);
  });

  it('groups consecutive bullets into one <ul> and breaks paragraphs on blank lines', () => {
    const html = renderReleaseNotes('- one\n- two\n\nA new paragraph.');
    expect(html).toMatch(/<ul><li>one<\/li><li>two<\/li><\/ul>/);
    expect(html).toContain('<p>A new paragraph.</p>');
  });

  it('renders the {version,note}[] array form as per-version sections', () => {
    const html = renderReleaseNotes([
      { version: '1.5.0', note: '### Added\n- thing' },
      { version: '1.4.0', note: '- old fix' },
    ]);
    expect(html).toContain('Version 1.5.0');
    expect(html).toContain('Version 1.4.0');
    expect(html).toContain('<h3>Added</h3>');
    expect(html).toContain('<li>old fix</li>');
    // Two sections rendered.
    expect((html.match(/class="cl-version"/g) ?? []).length).toBe(2);
  });

  it('escapes a malicious version label in the array form', () => {
    const html = renderReleaseNotes([{ version: '<script>1</script>', note: 'x' }]);
    expect(html).not.toContain('<script>1</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns empty string for null / undefined notes', () => {
    expect(renderReleaseNotes(null)).toBe('');
    expect(renderReleaseNotes(undefined as never)).toBe('');
  });
});

describe('openChangelogWindow + wireChangelogIpc (electron glue)', () => {
  let openChangelogWindow: typeof import('./changelog-window').openChangelogWindow;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    MockBrowserWindow.instances = [];
    MockBrowserWindow.fromWebContents = vi.fn(() => undefined);
    ({ openChangelogWindow } = await import('./changelog-window.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function open(extra: Partial<import('./changelog-window').OpenChangelogOptions> = {}) {
    return openChangelogWindow({
      info: info(),
      brandName: 'heron',
      preloadPath: '/app/changelog-preload.js',
      ...extra,
    });
  }

  it('creates a locked-down, frameless BrowserWindow and loads the changelog HTML', () => {
    open();
    expect(MockBrowserWindow.instances).toHaveLength(1);
    const win = MockBrowserWindow.instances[0];
    expect(win.opts.frame).toBe(false);
    expect(win.opts.resizable).toBe(false);
    const wp = win.opts.webPreferences as Record<string, unknown>;
    expect(wp.contextIsolation).toBe(true);
    expect(wp.nodeIntegration).toBe(false);
    expect(wp.sandbox).toBe(false);
    expect(wp.preload).toBe('/app/changelog-preload.js');
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

  it('opens a fresh window after the previous one is destroyed', () => {
    const first = open();
    first.destroyed = true;
    const second = open();
    expect(second).not.toBe(first);
    expect(MockBrowserWindow.instances).toHaveLength(2);
  });

  it('opens a fresh window after the previous one fired closed', () => {
    const first = open();
    first.onHandlers.closed?.();
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

  it('closes on Escape and ignores non-keyDown / other keys', () => {
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

  it('closes on Cmd/Ctrl+W', () => {
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

  it('registers the five brand-namespaced IPC channels exactly once', () => {
    open();
    const channels = __ipcOn.mock.calls.map((c) => c[0]);
    expect(channels).toContain('heron:changelog:open-external');
    expect(channels).toContain('heron:changelog:download');
    expect(channels).toContain('heron:changelog:install');
    expect(channels).toContain('heron:changelog:skip');
    expect(channels).toContain('heron:changelog:close');
    // Re-opening (after close) must NOT re-register: wireChangelogIpc is idempotent.
    MockBrowserWindow.instances[0].onHandlers.closed?.();
    __ipcOn.mockClear();
    open();
    expect(__ipcOn).not.toHaveBeenCalled();
  });

  it('open-external IPC opens only http(s) urls via shell', () => {
    const win = open();
    const sender = win.webContents;
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:open-external')![1];
    handler({ sender }, 'https://heron.app');
    expect(__shellOpenExternal).toHaveBeenCalledWith('https://heron.app');
    __shellOpenExternal.mockClear();
    handler({ sender }, 'javascript:alert(1)');
    handler({ sender }, 42);
    expect(__shellOpenExternal).not.toHaveBeenCalled();
  });

  it('rejects IPC from a sender that is NOT the changelog window (sender-identity guard)', () => {
    const onDownload = vi.fn();
    open({ onDownload });
    const open_ext = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:open-external')![1];
    const download = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:download')![1];
    open_ext({ sender: { not: 'the changelog window' } }, 'https://heron.app');
    download({ sender: { not: 'the changelog window' } });
    expect(__shellOpenExternal).not.toHaveBeenCalled();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('download / install IPC fire the caller-supplied callbacks (autoUpdater decoupled)', () => {
    const onDownload = vi.fn();
    const onInstall = vi.fn();
    const win = open({ onDownload, onInstall });
    const sender = win.webContents;
    const download = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:download')![1];
    const install = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:install')![1];
    download({ sender });
    install({ sender });
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('download / install IPC are no-ops when no callback was supplied', () => {
    const win = open();
    const sender = win.webContents;
    const download = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:download')![1];
    const install = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:install')![1];
    expect(() => {
      download({ sender });
      install({ sender });
    }).not.toThrow();
  });

  it('reopening updates which callbacks the wired-once IPC reaches', () => {
    const first = vi.fn();
    open({ onDownload: first });
    MockBrowserWindow.instances[0].onHandlers.closed?.();
    const second = vi.fn();
    const win = open({ onDownload: second });
    const download = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:download')![1];
    download({ sender: win.webContents });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('skip IPC fires onSkip then closes the sender window (downloaded escape hatch)', () => {
    const onSkip = vi.fn();
    const win = open({ onSkip });
    const closeSpy = vi.fn();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: closeSpy }) as never);
    const skip = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:skip')![1];
    skip({ sender: win.webContents });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('skip IPC ignores a foreign sender (sender-identity guard)', () => {
    const onSkip = vi.fn();
    open({ onSkip });
    const closeSpy = vi.fn();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: closeSpy }) as never);
    const skip = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:skip')![1];
    skip({ sender: {} });
    expect(onSkip).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('skip IPC is a no-op when no onSkip callback was supplied', () => {
    const win = open();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: vi.fn() }) as never);
    const skip = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:skip')![1];
    expect(() => skip({ sender: win.webContents })).not.toThrow();
  });

  it('close IPC closes the sender window when it is the changelog window', () => {
    const win = open();
    const closeSpy = vi.fn();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: closeSpy }) as never);
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:close')![1];
    handler({ sender: win.webContents });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('close IPC ignores a foreign sender (sender-identity guard)', () => {
    open();
    const closeSpy = vi.fn();
    MockBrowserWindow.fromWebContents = vi.fn(() => ({ close: closeSpy }) as never);
    const handler = __ipcOn.mock.calls.find((c) => c[0] === 'heron:changelog:close')![1];
    handler({ sender: {} });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('dev HMR: reloads the open window when build/mascot.png is regenerated', () => {
    let captured: ((event: string, file: string) => void) | undefined;
    __watch.mockImplementation(((_dir: string, cb: (event: string, file: string) => void) => {
      captured = cb;
      return { close: vi.fn() };
    }) as never);
    __readFileSync.mockReturnValue(Buffer.from('PNGDATA'));
    const win = open({ appPath: '/app' });
    expect(__watch).toHaveBeenCalled();
    win.loadURL.mockClear();
    captured?.('change', 'other.png');
    expect(win.loadURL).not.toHaveBeenCalled();
    captured?.('change', 'mascot.png');
    expect(win.loadURL).toHaveBeenCalled();
  });
});

describe('readLogoDataUri', () => {
  let readLogoDataUri: typeof import('./changelog-window').readLogoDataUri;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ readLogoDataUri } = await import('./changelog-window.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a data: URI when the icon file is readable', () => {
    __readFileSync.mockReturnValue(Buffer.from('PNGDATA'));
    expect(readLogoDataUri('/app')).toBe(
      `data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`,
    );
  });

  it('returns undefined when the icon file is missing', () => {
    __readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readLogoDataUri('/app')).toBeUndefined();
  });
});
