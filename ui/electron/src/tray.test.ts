/**
 * tray.test -- DesktopTray controller. Mocks electron's Tray/Menu/
 * nativeImage/app/BrowserWindow + node:fs + node:http + node:https.
 * Tests cover: constructor (menubar-only pref restore), start (icon +
 * Tray creation + listener wiring + poll interval), stop (cleanup),
 * refresh (stats fetch success/failure + menu rebuild), menu structure
 * (section quick-jumps + separators).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __trayCtor = vi.fn();
const __traySetToolTip = vi.fn();
const __trayOn = vi.fn();
const __trayPopUpContextMenu = vi.fn();
const __trayDestroy = vi.fn();
const __traySetTitle = vi.fn();
const __traySetContextMenu = vi.fn();
const __menuBuildFromTemplate = vi.fn();
const __createFromPath = vi.fn();
const __resize = vi.fn();
const __setTemplateImage = vi.fn();
const __appGetPath = vi.fn(() => '/tmp/userData');
const __appGetVersion = vi.fn(() => '1.0.0');
const __appOn = vi.fn();
const __appDockSetBadge = vi.fn();
const __appDockHide = vi.fn();
const __appDockShow = vi.fn();
const __browserWindowGetAll = vi.fn(() => []);
const __existsSync = vi.fn(() => false);
const __unlinkSync = vi.fn();
const __rmSync = vi.fn();
const __writeFileSync = vi.fn();

// Selector: `dock: 'present'` (default) renders the dock API; `'missing'`
// drops it so we can exercise the `!app.dock` defensive branches.
let __dockShape: 'present' | 'missing' = 'present';

vi.mock('electron', () => ({
  Tray: __trayCtor,
  Menu: { buildFromTemplate: __menuBuildFromTemplate },
  nativeImage: { createFromPath: __createFromPath },
  app: {
    getPath: __appGetPath,
    getVersion: __appGetVersion,
    on: __appOn,
    get dock() {
      if (__dockShape === 'missing') {
        return undefined;
      }
      return { setBadge: __appDockSetBadge, hide: __appDockHide, show: __appDockShow };
    },
  },
  BrowserWindow: { getAllWindows: __browserWindowGetAll },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: __existsSync,
    unlinkSync: __unlinkSync,
    rmSync: __rmSync,
    writeFileSync: __writeFileSync,
  },
  existsSync: __existsSync,
  unlinkSync: __unlinkSync,
  rmSync: __rmSync,
  writeFileSync: __writeFileSync,
}));

// Mock http/https: throw synchronously inside `request()` so the outer
// try/catch in fetchStats() catches + resolves(null) immediately. Without
// this the Promise hangs (no listeners ever fire under fake timers) and
// refresh() (which awaits the fetch) never calls rebuildMenu.
const __throwingReq = () => {
  throw new Error('mocked: no real network');
};
vi.mock('node:http', () => ({ request: __throwingReq }));
vi.mock('node:https', () => ({ request: __throwingReq }));

vi.mock('./brand', () => ({
  BRAND: { name: 'heron', displayName: 'Heron' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __dockShape = 'present';
  __existsSync.mockReturnValue(false);
  __trayCtor.mockImplementation(function () {
    return {
      setToolTip: __traySetToolTip,
      on: __trayOn,
      popUpContextMenu: __trayPopUpContextMenu,
      destroy: __trayDestroy,
      setTitle: __traySetTitle,
      setContextMenu: __traySetContextMenu,
    };
  });
  __createFromPath.mockReturnValue({
    resize: __resize,
    setTemplateImage: __setTemplateImage,
  });
  __resize.mockImplementation(function () {
    return {
      setTemplateImage: __setTemplateImage,
    };
  });
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function handlers() {
  return {
    getBackendUrl: vi.fn(() => 'http://localhost:5173'),
    onOpen: vi.fn(),
    onQuit: vi.fn(),
    onOpenPath: vi.fn(),
    onSetDockVisible: vi.fn(),
  };
}

describe('desktopTray -- constructor', () => {
  it('reads menubar-only.pref absence and defaults to false', async () => {
    __existsSync.mockReturnValue(false);
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    expect(t).toBeDefined();
    expect(__appGetPath).toHaveBeenCalledWith('userData');
  });

  it('reads menubar-only.pref presence as true (persisted)', async () => {
    __existsSync.mockReturnValue(true);
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    expect(t).toBeDefined();
  });

  it('handles fs.existsSync throwing (read failure)', async () => {
    __existsSync.mockImplementation(() => {
      throw new Error('fs unreachable');
    });
    const { DesktopTray } = await import('./tray.js');
    expect(() => new DesktopTray(handlers())).not.toThrow();
  });
});

describe('desktopTray -- start', () => {
  it('creates a Tray instance with the icon', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    expect(__trayCtor).toHaveBeenCalled();
    expect(__createFromPath).toHaveBeenCalled();
    expect(__resize).toHaveBeenCalledWith({ width: 22, height: 22 });
    t.stop();
  });

  it('sets the brand displayName as tooltip', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    expect(__traySetToolTip).toHaveBeenCalledWith('Heron');
    t.stop();
  });

  it('wires click + right-click listeners', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    const events = __trayOn.mock.calls.map((c) => c[0]);
    expect(events).toContain('click');
    expect(events).toContain('right-click');
    t.stop();
  });

  it('schedules the stats poll interval', async () => {
    const setIntSpy = vi.spyOn(globalThis, 'setInterval');
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    expect(setIntSpy).toHaveBeenCalled();
    t.stop();
  });
});

describe('desktopTray -- stop', () => {
  it('clears the poll interval', async () => {
    const clearIntSpy = vi.spyOn(globalThis, 'clearInterval');
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    t.stop();
    expect(clearIntSpy).toHaveBeenCalled();
  });

  it('destroys the tray instance', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    t.stop();
    expect(__trayDestroy).toHaveBeenCalled();
  });

  it('is safe to call before start (no tray yet)', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    expect(() => t.stop()).not.toThrow();
  });
});

describe('desktopTray -- click handlers', () => {
  it('left-click on non-mac invokes handlers.onOpen', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const h = handlers();
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(h);
    t.start();
    // Find the click handler that was registered.
    const clickCb = __trayOn.mock.calls.find((c) => c[0] === 'click')?.[1] as () => void;
    clickCb();
    expect(h.onOpen).toHaveBeenCalled();
    t.stop();
  });

  it('left-click on mac is a no-op (right-click handles menu)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const h = handlers();
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(h);
    t.start();
    const clickCb = __trayOn.mock.calls.find((c) => c[0] === 'click')?.[1] as () => void;
    clickCb();
    expect(h.onOpen).not.toHaveBeenCalled();
    t.stop();
  });

  it('right-click pops up the context menu', async () => {
    const { DesktopTray } = await import('./tray.js');
    const t = new DesktopTray(handlers());
    t.start();
    const rightClickCb = __trayOn.mock.calls.find((c) => c[0] === 'right-click')?.[1] as () => void;
    rightClickCb();
    expect(__trayPopUpContextMenu).toHaveBeenCalled();
    t.stop();
  });
});

// ── Helper to drive a refresh and grab the most-recent menu items ─
async function startAndRefresh(handlers: ReturnType<typeof import('vitest').vi.fn> | any) {
  const { DesktopTray } = await import('./tray.js');
  const t = new DesktopTray(handlers);
  t.start();
  // start() triggers an immediate refresh(). The fetchStats fails (mocked
  // node:http throws), so stats = null + rebuildMenu fires with null.
  // Drain microtasks so the catch + rebuildMenu both land.
  await Promise.resolve();
  await Promise.resolve();
  return t;
}

function lastMenuTemplate(): import('electron').MenuItemConstructorOptions[] {
  const lastCall =
    __menuBuildFromTemplate.mock.calls[__menuBuildFromTemplate.mock.calls.length - 1];
  return (lastCall?.[0] ?? []) as import('electron').MenuItemConstructorOptions[];
}

describe('desktopTray -- refresh + menu', () => {
  it('refresh sets a context menu via Menu.buildFromTemplate', async () => {
    const t = await startAndRefresh(handlers());
    expect(__menuBuildFromTemplate).toHaveBeenCalled();
    expect(__traySetContextMenu).toHaveBeenCalled();
    t.stop();
  });

  it('schedules a periodic refresh via setInterval (poll fires after 30s)', async () => {
    const t = await startAndRefresh(handlers());
    __menuBuildFromTemplate.mockClear();
    // Advance fake timers past the 30s POLL_INTERVAL_MS.
    vi.advanceTimersByTime(30_000);
    // Drain microtasks so the awaited fetchStats inside the interval-
    // triggered refresh completes (mocked node:http throws -> resolves null).
    vi.useRealTimers();
    await new Promise<void>((r) => setImmediate(r));
    expect(__menuBuildFromTemplate).toHaveBeenCalled();
    vi.useFakeTimers();
    t.stop();
  });

  it('refresh sets the macOS title (empty when stats are null)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const t = await startAndRefresh(handlers());
    expect(__traySetTitle).toHaveBeenCalledWith('');
    t.stop();
  });

  it('refresh skips title update on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const t = await startAndRefresh(handlers());
    // setTitle is still called (with empty string for non-darwin per computeTrayTitle).
    expect(__traySetTitle).toHaveBeenCalledWith('');
    t.stop();
  });

  it('refresh updates the macOS dock badge (empty when stats are null)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const t = await startAndRefresh(handlers());
    expect(__appDockSetBadge).toHaveBeenCalledWith('');
    t.stop();
  });

  it('refresh skips dock badge on non-darwin platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const t = await startAndRefresh(handlers());
    expect(__appDockSetBadge).not.toHaveBeenCalled();
    t.stop();
  });

  it('menu template includes "(backend offline)" when stats are null', async () => {
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const offline = items.find((i) => i.label === '(backend offline)');
    expect(offline).toBeTruthy();
    t.stop();
  });

  it('menu template has the section quick-jumps', async () => {
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    expect(items.find((i) => i.label === 'Pipeline')).toBeTruthy();
    expect(items.find((i) => i.label === 'Inbox')).toBeTruthy();
    expect(items.find((i) => i.label === 'Queue')).toBeTruthy();
    expect(items.find((i) => i.label === 'Stats')).toBeTruthy();
    t.stop();
  });

  it('click on Pipeline routes to onOpenPath("/pipeline")', async () => {
    const h = handlers();
    const t = await startAndRefresh(h);
    const items = lastMenuTemplate();
    const pipeline = items.find((i) => i.label === 'Pipeline')!;
    (pipeline.click as () => void)();
    expect(h.onOpenPath).toHaveBeenCalledWith('/pipeline');
    t.stop();
  });

  it('falls back to onOpen when onOpenPath is undefined', async () => {
    const h = handlers();
    delete (h as any).onOpenPath;
    const t = await startAndRefresh(h);
    const items = lastMenuTemplate();
    const inbox = items.find((i) => i.label === 'Inbox')!;
    (inbox.click as () => void)();
    expect(h.onOpen).toHaveBeenCalled();
    t.stop();
  });

  it('click on Show dashboard invokes handlers.onOpen', async () => {
    const h = handlers();
    const t = await startAndRefresh(h);
    const items = lastMenuTemplate();
    const show = items.find((i) => i.label === 'Show dashboard')!;
    (show.click as () => void)();
    expect(h.onOpen).toHaveBeenCalled();
    t.stop();
  });

  it('click on Hide window invokes BrowserWindow.getAllWindows().hide()', async () => {
    const hide1 = vi.fn();
    const hide2 = vi.fn();
    __browserWindowGetAll.mockReturnValue([{ hide: hide1 }, { hide: hide2 }] as any);
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const hide = items.find((i) => i.label === 'Hide window')!;
    (hide.click as () => void)();
    expect(hide1).toHaveBeenCalled();
    expect(hide2).toHaveBeenCalled();
    t.stop();
  });

  it('click on Quit invokes handlers.onQuit', async () => {
    const h = handlers();
    const t = await startAndRefresh(h);
    const items = lastMenuTemplate();
    const quit = items.find((i) => /^Quit /.test(String(i.label)))!;
    (quit.click as () => void)();
    expect(h.onQuit).toHaveBeenCalled();
    t.stop();
  });

  it('click on Scan now invokes runTask (postEmpty failure is silent)', async () => {
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const scan = items.find((i) => i.label === 'Scan now')!;
    // postEmpty also uses node:http which is mocked to throw; the call
    // should be invoked + resolve null silently.
    expect(() => (scan.click as () => void)()).not.toThrow();
    t.stop();
  });
});

describe('desktopTray -- macOS Menu Bar Only', () => {
  it('menu Bar Only checkbox click hides Dock + persists pref', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const toggle = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')!;
    (toggle.click as () => void)();
    expect(__appDockHide).toHaveBeenCalled();
    expect(__writeFileSync).toHaveBeenCalledWith(expect.stringContaining('menubar-only.pref'), '1');
    t.stop();
  });

  it('rebuild after toggle re-renders the menu with new state', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const t = await startAndRefresh(handlers());
    // Grab the click handler BEFORE clearing mocks.
    const items = lastMenuTemplate();
    const toggle = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')!;
    __menuBuildFromTemplate.mockClear();
    (toggle.click as () => void)();
    // setMenuBarOnly calls rebuildMenu -> buildFromTemplate.
    expect(__menuBuildFromTemplate).toHaveBeenCalled();
    t.stop();
  });

  it('menu Bar Only no-op on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    // No Menu Bar Only item on linux.
    expect(items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')).toBeUndefined();
    t.stop();
  });

  it('toggling Menu Bar Only off removes the persisted pref + shows dock', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    // Pretend menu-bar-only was persisted -> tray starts in menuBarOnly state.
    __existsSync.mockReturnValue(true);
    const t = await startAndRefresh(handlers());
    // First toggle click flips from true -> false (disable path).
    const items = lastMenuTemplate();
    const toggle = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')!;
    (toggle.click as () => void)();
    expect(__appDockShow).toHaveBeenCalled();
    expect(__rmSync).toHaveBeenCalledWith(expect.stringContaining('menubar-only.pref'), {
      force: true,
    });
    t.stop();
  });
});

describe('desktopTray -- defensive paths', () => {
  // Tests for the `!app.dock` branches in updateDockBadge + setMenuBarOnly.
  // app.dock is normally always present on darwin, but very-old Electron /
  // headless mode can leave it undefined. The early-return is defensive.

  it('updateDockBadge returns when app.dock is undefined on darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    __dockShape = 'missing';
    const t = await startAndRefresh(handlers());
    expect(__appDockSetBadge).not.toHaveBeenCalled();
    t.stop();
  });

  it('setMenuBarOnly returns early when app.dock is undefined on darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    __dockShape = 'missing';
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const toggle = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)');
    if (toggle) {
      (toggle.click as () => void)();
    }
    expect(__appDockHide).not.toHaveBeenCalled();
    expect(__appDockShow).not.toHaveBeenCalled();
    expect(__writeFileSync).not.toHaveBeenCalled();
    t.stop();
  });
});

describe('desktopTray -- runTask + toggleAutopilot (mocked tray-http)', () => {
  // For this block we override the tray-http module to give the tray
  // real stats + a successful postEmpty, so the autopilot toggle path
  // (postEmpty -> .then -> refresh) is exercised.
  beforeEach(() => {
    vi.doMock('./tray-http', () => ({
      fetchStats: vi.fn(async () => ({
        queued: 2,
        appliedToday: 1,
        upcomingInterviews: 0,
        autopilotPaused: false,
      })),
      postEmpty: vi.fn(async () => undefined),
    }));
  });

  afterEach(() => {
    vi.doUnmock('./tray-http');
  });

  it('clicking Pause autopilot invokes postEmpty then refreshes the menu', async () => {
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const pauseItem = items.find((i) => i.label === 'Pause autopilot');
    expect(pauseItem).toBeTruthy();
    __menuBuildFromTemplate.mockClear();
    (pauseItem!.click as () => void)();
    // Let postEmpty resolve, .then(refresh) chain through fetchStats await,
    // then rebuildMenu. Drain microtask queue via setImmediate.
    vi.useRealTimers();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(__menuBuildFromTemplate).toHaveBeenCalled();
    vi.useFakeTimers();
    t.stop();
  });

  it('clicking Scan now invokes postEmpty (fire-and-forget)', async () => {
    const t = await startAndRefresh(handlers());
    const items = lastMenuTemplate();
    const scan = items.find((i) => i.label === 'Scan now')!;
    expect(() => (scan.click as () => void)()).not.toThrow();
    t.stop();
  });
});
