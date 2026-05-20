/**
 * app-menu.test -- AppMenuBar builder. Mocks electron's Menu/shell/app
 * and toggles process.platform to exercise the mac vs win/linux
 * branches. Asserts the menu template shape (top-level labels + click
 * handler wiring + role values).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __buildFromTemplate = vi.fn();
const __openExternal = vi.fn();
const __appGetVersion = vi.fn(() => '1.2.3');
const __getFocusedWindow = vi.fn();

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: __buildFromTemplate },
  BrowserWindow: { getFocusedWindow: __getFocusedWindow },
  shell: { openExternal: __openExternal },
  app: { getVersion: __appGetVersion },
}));

vi.mock('./brand', () => ({
  BRAND: {
    name: 'heron',
    displayName: 'Heron',
    repoUrl: 'https://github.com/example/heron',
  },
}));

const __originalPlatform = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  __buildFromTemplate.mockReset();
  __openExternal.mockReset();
  __getFocusedWindow.mockReset();
  __buildFromTemplate.mockReturnValue({ __mockMenu: true });
});

afterEach(() => {
  setPlatform(__originalPlatform);
  vi.restoreAllMocks();
});

function handlers() {
  return {
    onAbout: vi.fn(),
    onPreferences: vi.fn(),
    onOpenDocs: vi.fn(),
    onReportBug: vi.fn(),
  };
}

describe('buildAppMenu -- macOS', () => {
  beforeEach(() => setPlatform('darwin'));

  it('prepends an app menu (Apple HIG)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    expect(template[0].label).toBe('Heron');
    expect(Array.isArray(template[0].submenu)).toBe(true);
  });

  it('app menu has About + Preferences + Quit', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const submenu = __buildFromTemplate.mock.calls[0][0][0].submenu;
    const labels = submenu.map((s: { label?: string; role?: string }) => s.label ?? s.role);
    expect(labels).toContain('About Heron');
    expect(labels).toContain('Preferences…');
    expect(labels).toContain('quit'); // role
  });

  it('about click handler invokes h.onAbout', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const submenu = __buildFromTemplate.mock.calls[0][0][0].submenu;
    const aboutItem = submenu.find((s: { label?: string }) => s.label === 'About Heron');
    aboutItem.click();
    expect(h.onAbout).toHaveBeenCalled();
  });

  it('preferences click handler invokes h.onPreferences', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const submenu = __buildFromTemplate.mock.calls[0][0][0].submenu;
    const prefs = submenu.find((s: { label?: string }) => s.label === 'Preferences…');
    prefs.click();
    expect(h.onPreferences).toHaveBeenCalled();
  });

  it('Window menu has front + window roles on mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const windowMenu = template.find((t: { label?: string }) => t.label === '&Window');
    const roles = windowMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('front');
    expect(roles).toContain('window');
  });

  it('Help menu does NOT have a duplicate About entry on mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const aboutInHelp = helpMenu.submenu.find((s: { label?: string }) =>
      (s.label ?? '').includes('About'),
    );
    expect(aboutInHelp).toBeUndefined();
  });
});

describe('buildAppMenu -- win/linux', () => {
  beforeEach(() => setPlatform('linux'));

  it('does NOT prepend an app menu', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    // First slot is File, not the app menu.
    expect(template[0].label).toBe('&File');
  });

  it('File menu uses quit role (not close) on non-mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const lastItem = fileMenu.submenu[fileMenu.submenu.length - 1];
    expect(lastItem.role).toBe('quit');
  });

  it('Window menu has close (not front/window) on non-mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const windowMenu = template.find((t: { label?: string }) => t.label === '&Window');
    const roles = windowMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('close');
    expect(roles).not.toContain('front');
  });

  it('Help menu HAS an About entry on non-mac (no app menu fallback)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const aboutInHelp = helpMenu.submenu.find((s: { label?: string }) =>
      (s.label ?? '').includes('About'),
    );
    expect(aboutInHelp).toBeDefined();
    aboutInHelp.click();
    expect(h.onAbout).toHaveBeenCalled();
  });
});

describe('buildAppMenu -- common menus', () => {
  it('emits Edit menu with standard roles', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const editMenu = template.find((t: { label?: string }) => t.label === '&Edit');
    const roles = editMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toEqual(
      expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']),
    );
  });

  it('emits View menu with reload + dev tools + zoom', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    const roles = viewMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toEqual(
      expect.arrayContaining([
        'reload',
        'forceReload',
        'toggleDevTools',
        'resetZoom',
        'zoomIn',
        'zoomOut',
        'togglefullscreen',
      ]),
    );
  });

  it('Help/Documentation click invokes h.onOpenDocs', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const docs = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Documentation');
    docs.click();
    expect(h.onOpenDocs).toHaveBeenCalled();
  });

  it('Help/Report a bug click invokes h.onReportBug', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const bug = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Report a bug…');
    bug.click();
    expect(h.onReportBug).toHaveBeenCalled();
  });

  it('Help/View on GitHub click invokes shell.openExternal', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const gh = helpMenu.submenu.find((s: { label?: string }) => s.label === 'View on GitHub');
    gh.click();
    expect(__openExternal).toHaveBeenCalledWith('https://github.com/example/heron');
  });
});

describe('buildAppMenu -- File menu click handlers', () => {
  it('Import URL navigates focused window to /pipeline (replacing last segment)', async () => {
    const mockWebContents = {
      getURL: vi.fn(() => 'http://localhost:5173/inbox'),
      loadURL: vi.fn(() => Promise.resolve()),
    };
    __getFocusedWindow.mockReturnValue({ webContents: mockWebContents });
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const importUrl = fileMenu.submenu.find((s: { label?: string }) => s.label === 'Import URL…');
    importUrl.click();
    expect(mockWebContents.loadURL).toHaveBeenCalled();
    const target = (mockWebContents.loadURL as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(target).toContain('/pipeline');
  });

  it('Import URL is a no-op when no window is focused', async () => {
    __getFocusedWindow.mockReturnValue(null);
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const importUrl = fileMenu.submenu.find((s: { label?: string }) => s.label === 'Import URL…');
    expect(() => importUrl.click()).not.toThrow();
  });

  it('Open Pipeline navigates focused window using origin', async () => {
    const mockWebContents = {
      getURL: vi.fn(() => 'http://localhost:5173/inbox/123'),
      loadURL: vi.fn(() => Promise.resolve()),
    };
    __getFocusedWindow.mockReturnValue({ webContents: mockWebContents });
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const openPipeline = fileMenu.submenu.find(
      (s: { label?: string }) => s.label === 'Open Pipeline',
    );
    openPipeline.click();
    expect(mockWebContents.loadURL).toHaveBeenCalledWith('http://localhost:5173/pipeline');
  });

  it('Open Pipeline is a no-op when no window is focused', async () => {
    __getFocusedWindow.mockReturnValue(null);
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const openPipeline = fileMenu.submenu.find(
      (s: { label?: string }) => s.label === 'Open Pipeline',
    );
    expect(() => openPipeline.click()).not.toThrow();
  });
});

describe('buildAppMenu -- return value', () => {
  it('returns the result of Menu.buildFromTemplate', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const result = buildAppMenu(handlers());
    expect(result).toEqual({ __mockMenu: true });
  });
});
