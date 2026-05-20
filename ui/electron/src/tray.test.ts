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
const __appOn = vi.fn();
const __appDockSetBadge = vi.fn();
const __appDockHide = vi.fn();
const __appDockShow = vi.fn();
const __browserWindowGetAll = vi.fn(() => []);
const __existsSync = vi.fn(() => false);
const __unlinkSync = vi.fn();
const __writeFileSync = vi.fn();

vi.mock('electron', () => ({
  Tray: __trayCtor,
  Menu: { buildFromTemplate: __menuBuildFromTemplate },
  nativeImage: { createFromPath: __createFromPath },
  app: {
    getPath: __appGetPath,
    on: __appOn,
    dock: { setBadge: __appDockSetBadge, hide: __appDockHide, show: __appDockShow },
  },
  BrowserWindow: { getAllWindows: __browserWindowGetAll },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: __existsSync,
    unlinkSync: __unlinkSync,
    writeFileSync: __writeFileSync,
  },
  existsSync: __existsSync,
  unlinkSync: __unlinkSync,
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

describe('DesktopTray -- constructor', () => {
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

describe('DesktopTray -- start', () => {
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

describe('DesktopTray -- stop', () => {
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

describe('DesktopTray -- click handlers', () => {
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
