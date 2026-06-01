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

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: __buildFromTemplate },
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
    onCheckForUpdates: vi.fn(),
    onSetUpdateChannel: vi.fn(),
    onSimulateUpdate: vi.fn(),
    onClearCache: vi.fn(),
    onOpenDocs: vi.fn(),
    onReportBug: vi.fn(),
    onGotoLogin: vi.fn(),
    onPasskeySignin: vi.fn(),
    onGotoSignup: vi.fn(),
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

  it('app menu has About + Check for Updates + Settings + Quit', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const { submenu } = __buildFromTemplate.mock.calls[0][0][0];
    const labels = submenu.map((s: { label?: string; role?: string }) => s.label ?? s.role);
    expect(labels).toContain('About Heron');
    // "Settings…" is the modern macOS label (was "Preferences…").
    expect(labels).toContain('Settings…');
    expect(labels).not.toContain('Preferences…');
    expect(labels).toContain('Check for Updates…');
    expect(labels).toContain('quit'); // role
  });

  it('Check for Updates click invokes h.onCheckForUpdates', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const { submenu } = __buildFromTemplate.mock.calls[0][0][0];
    const item = submenu.find((s: { label?: string }) => s.label === 'Check for Updates…');
    item.click();
    expect(h.onCheckForUpdates).toHaveBeenCalled();
  });

  it('about click handler invokes h.onAbout', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const { submenu } = __buildFromTemplate.mock.calls[0][0][0];
    const aboutItem = submenu.find((s: { label?: string }) => s.label === 'About Heron');
    aboutItem.click();
    expect(h.onAbout).toHaveBeenCalled();
  });

  it('settings click handler invokes h.onPreferences (Cmd+,)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const { submenu } = __buildFromTemplate.mock.calls[0][0][0];
    const settings = submenu.find((s: { label?: string }) => s.label === 'Settings…');
    expect(settings.accelerator).toBe('Cmd+,');
    settings.click();
    expect(h.onPreferences).toHaveBeenCalled();
  });

  it('uses the OS-managed windowMenu role on mac (live window list)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    // macOS gets the built-in windowMenu role (AppKit maintains the window
    // list); we do NOT hand-roll a '&Window' submenu with a stale 'window' item.
    const windowMenu = template.find((t: { role?: string }) => t.role === 'windowMenu');
    expect(windowMenu).toBeDefined();
    expect(template.find((t: { label?: string }) => t.label === '&Window')).toBeUndefined();
  });

  it('help menu does NOT have a duplicate About entry on mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const aboutInHelp = helpMenu.submenu.find((s: { label?: string }) =>
      (s.label ?? '').includes('About'),
    );
    expect(aboutInHelp).toBeUndefined();
  });

  // WHY: the canonical macOS Edit menu (Electron docs) ships a Speech submenu
  // (Start/Stop Speaking) + pasteAndMatchStyle. These are the macOS-only
  // affordances we previously lacked; assert them so the platform menu stays HIG.
  it('Edit has a macOS Speech submenu + pasteAndMatchStyle', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const editMenu = template.find((t: { label?: string }) => t.label === '&Edit');
    const roles = editMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('pasteAndMatchStyle');
    const speech = editMenu.submenu.find((s: { label?: string }) => s.label === 'Speech');
    expect(speech, 'macOS Edit should have a Speech submenu').toBeDefined();
    const speechRoles = speech.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(speechRoles).toEqual(expect.arrayContaining(['startSpeaking', 'stopSpeaking']));
  });

  // WHY: macOS auto-inserts "Enter Full Screen" into the View menu, so an
  // explicit togglefullscreen role renders a DUPLICATE. We omit ours on mac.
  it('View omits togglefullscreen on macOS (system supplies Enter Full Screen)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { isDev: true });
    const template = __buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    const roles = viewMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).not.toContain('togglefullscreen');
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

  it('file menu uses quit role (not close) on non-mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const lastItem = fileMenu.submenu[fileMenu.submenu.length - 1];
    expect(lastItem.role).toBe('quit');
  });

  it('window menu has close (not front/window) on non-mac', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const windowMenu = template.find((t: { label?: string }) => t.label === '&Window');
    const roles = windowMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('close');
    expect(roles).not.toContain('front');
  });

  it('help menu HAS an About entry on non-mac (no app menu fallback)', async () => {
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

  it('help menu HAS Check for Updates on non-mac (no app menu to hold it)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const cfu = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Check for Updates…');
    expect(cfu, 'win/linux Help should hold Check for Updates').toBeDefined();
    cfu.click();
    expect(h.onCheckForUpdates).toHaveBeenCalled();
  });

  // WHY: pasteAndMatchStyle + the Speech submenu are macOS-only; on Win/Linux
  // they'd be dead/no-op items, so the canonical non-mac Edit menu omits them.
  it('Edit omits macOS-only pasteAndMatchStyle + Speech on win/linux', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const editMenu = template.find((t: { label?: string }) => t.label === '&Edit');
    const roles = editMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('selectAll');
    expect(roles).toContain('delete');
    expect(roles).not.toContain('pasteAndMatchStyle');
    const speech = editMenu.submenu.find((s: { label?: string }) => s.label === 'Speech');
    expect(speech).toBeUndefined();
  });

  // WHY: no macOS-style system auto-add on Win/Linux, so we MUST supply our own.
  it('View includes togglefullscreen on win/linux', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    const roles = viewMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain('togglefullscreen');
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

  // WHY: shipping Reload / Force-Reload / Toggle-DevTools in a PRODUCTION menu is
  // a UX + footgun smell (users reload into a blank state, or open devtools by
  // accident). They belong only in dev. Zoom + fullscreen are always useful.
  function viewRoles(opts?: Record<string, unknown>) {
    return (mod: { buildAppMenu: (h: unknown, o?: unknown) => unknown }) => {
      mod.buildAppMenu(handlers(), opts);
      const template = __buildFromTemplate.mock.calls.at(-1)![0];
      const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
      return viewMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    };
  }

  it('View hides reload/forceReload/devtools in production (no isDev)', async () => {
    const mod = await import('./app-menu.js');
    const roles = viewRoles()(mod);
    expect(roles).not.toContain('reload');
    expect(roles).not.toContain('forceReload');
    expect(roles).not.toContain('toggleDevTools');
    expect(roles).toEqual(expect.arrayContaining(['resetZoom', 'zoomIn', 'zoomOut']));
  });

  it('View exposes reload/forceReload/devtools in dev (isDev: true)', async () => {
    const mod = await import('./app-menu.js');
    const roles = viewRoles({ isDev: true })(mod);
    expect(roles).toEqual(
      expect.arrayContaining([
        'reload',
        'forceReload',
        'toggleDevTools',
        'resetZoom',
        'zoomIn',
        'zoomOut',
      ]),
    );
  });

  it('help/Documentation click invokes h.onOpenDocs', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const docs = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Documentation');
    docs.click();
    expect(h.onOpenDocs).toHaveBeenCalled();
  });

  it('help/Report a bug click invokes h.onReportBug', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const bug = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Report a bug…');
    bug.click();
    expect(h.onReportBug).toHaveBeenCalled();
  });

  it('help/View on GitHub click invokes shell.openExternal', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const gh = helpMenu.submenu.find((s: { label?: string }) => s.label === 'View on GitHub');
    gh.click();
    expect(__openExternal).toHaveBeenCalledWith('https://github.com/example/heron');
  });

  it('help/Release Notes opens the GitHub releases page', async () => {
    // WHY: users want to see WHAT changed before/after updating; Release Notes
    // links straight to the tagged GitHub releases (distinct from the repo root).
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const rn = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Release Notes');
    expect(rn, 'Help should have a Release Notes item').toBeDefined();
    rn.click();
    expect(__openExternal).toHaveBeenCalledWith('https://github.com/example/heron/releases');
  });
});

describe('buildAppMenu -- View menu Clear Cache & Reload', () => {
  const viewLabels = () => {
    const template = __buildFromTemplate.mock.calls.at(-1)![0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    return viewMenu.submenu.map((s: { label?: string }) => s.label).filter(Boolean);
  };

  // WHY: a wedged cache / stale session is a real PROD support path, so unlike
  // the dev-gated reload/devtools items this MUST be present regardless of isDev.
  it('includes a "Clear Cache & Reload" item in production (no isDev)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    expect(viewLabels()).toEqual(expect.arrayContaining(['Clear Cache & Reload…']));
  });

  it('includes a "Clear Cache & Reload" item in dev (isDev: true)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { isDev: true });
    expect(viewLabels()).toEqual(expect.arrayContaining(['Clear Cache & Reload…']));
  });

  it('Clear Cache & Reload click invokes h.onClearCache', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const template = __buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    const item = viewMenu.submenu.find(
      (s: { label?: string }) => s.label === 'Clear Cache & Reload…',
    );
    item.click();
    expect(h.onClearCache).toHaveBeenCalled();
  });
});

describe('buildAppMenu -- View menu Simulate update (dev-gated)', () => {
  const viewItems = () => {
    const template = __buildFromTemplate.mock.calls.at(-1)![0];
    const viewMenu = template.find((t: { label?: string }) => t.label === '&View');
    return viewMenu.submenu as Array<{ label?: string; role?: string; click?: () => void }>;
  };

  // WHY: a fake "update ready" card in PRODUCTION would mislead users into
  // thinking a real update is staged. It's a dev-only preview affordance, gated
  // like the reload / devtools items.
  it('hides "Simulate update…" in production (no isDev)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const labels = viewItems()
      .map((s) => s.label)
      .filter(Boolean);
    expect(labels).not.toContain('Simulate update…');
  });

  it('shows "Simulate update…" in dev (isDev: true) and wires onSimulateUpdate', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h, { isDev: true });
    const item = viewItems().find((s) => s.label === 'Simulate update…');
    expect(item, 'dev View menu should hold Simulate update…').toBeDefined();
    item!.click!();
    expect(h.onSimulateUpdate).toHaveBeenCalled();
  });
});

describe('buildAppMenu -- Help menu Release channel submenu', () => {
  const channelSubmenu = () => {
    const template = __buildFromTemplate.mock.calls.at(-1)![0];
    const helpMenu = template.find((t: { label?: string }) => t.label === '&Help');
    const rc = helpMenu.submenu.find((s: { label?: string }) => s.label === 'Release channel');
    return rc?.submenu as
      | Array<{ label?: string; type?: string; checked?: boolean; click?: () => void }>
      | undefined;
  };

  // WHY: opting into prereleases is a per-user choice that must survive restarts
  // (persisted by the handler) and be discoverable in the native menu, mirroring
  // the Settings UI radio group.
  it('Help has a Release channel submenu with Stable + Beta radios', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const sub = channelSubmenu();
    expect(sub, 'Help should have a Release channel submenu').toBeDefined();
    const stable = sub!.find((s) => s.label === 'Stable');
    const beta = sub!.find((s) => s.label === 'Beta');
    expect(stable?.type).toBe('radio');
    expect(beta?.type).toBe('radio');
  });

  it('checks the Stable radio by default (no updateChannel given)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const sub = channelSubmenu()!;
    expect(sub.find((s) => s.label === 'Stable')!.checked).toBe(true);
    expect(sub.find((s) => s.label === 'Beta')!.checked).toBe(false);
  });

  it('checks the Beta radio when updateChannel is beta', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { updateChannel: 'beta' });
    const sub = channelSubmenu()!;
    expect(sub.find((s) => s.label === 'Stable')!.checked).toBe(false);
    expect(sub.find((s) => s.label === 'Beta')!.checked).toBe(true);
  });

  it('clicking a radio invokes onSetUpdateChannel with the chosen channel', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h);
    const sub = channelSubmenu()!;
    sub.find((s) => s.label === 'Beta')!.click!();
    expect(h.onSetUpdateChannel).toHaveBeenCalledWith('beta');
    sub.find((s) => s.label === 'Stable')!.click!();
    expect(h.onSetUpdateChannel).toHaveBeenCalledWith('stable');
  });
});

describe('buildAppMenu -- File menu', () => {
  it('File menu has no in-app nav items (Import URL / Open Pipeline removed)', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const labels = fileMenu.submenu.map((s: { label?: string }) => s.label).filter(Boolean);
    expect(labels).not.toContain('Import URL…');
    expect(labels).not.toContain('Open Pipeline');
  });
});

describe('buildAppMenu -- File menu auth actions (login/signup only)', () => {
  const AUTH_LABELS = ['Login page', 'Sign in with passkey', 'Set up with invite code'];
  const fileLabels = () => {
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    return fileMenu.submenu.map((s: { label?: string }) => s.label).filter(Boolean);
  };

  it('shows the auth actions on /login', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { route: '/login' });
    expect(fileLabels()).toEqual(expect.arrayContaining(AUTH_LABELS));
  });

  it('shows the auth actions on /signup', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { route: '/signup' });
    expect(fileLabels()).toEqual(expect.arrayContaining(AUTH_LABELS));
  });

  it('omits the auth actions off auth routes', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers(), { route: '/dashboard' });
    for (const l of AUTH_LABELS) expect(fileLabels()).not.toContain(l);
  });

  it('omits the auth actions when no route is given', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    buildAppMenu(handlers());
    for (const l of AUTH_LABELS) expect(fileLabels()).not.toContain(l);
  });

  it('wires the auth action click handlers', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const h = handlers();
    buildAppMenu(h, { route: '/login' });
    const template = __buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((t: { label?: string }) => t.label === '&File');
    const byLabel = (label: string) =>
      fileMenu.submenu.find((s: { label?: string }) => s.label === label);
    byLabel('Login page').click();
    byLabel('Sign in with passkey').click();
    byLabel('Set up with invite code').click();
    expect(h.onGotoLogin).toHaveBeenCalled();
    expect(h.onPasskeySignin).toHaveBeenCalled();
    expect(h.onGotoSignup).toHaveBeenCalled();
  });
});

describe('buildAppMenu -- return value', () => {
  it('returns the result of Menu.buildFromTemplate', async () => {
    const { buildAppMenu } = await import('./app-menu.js');
    const result = buildAppMenu(handlers());
    expect(result).toEqual({ __mockMenu: true });
  });
});
