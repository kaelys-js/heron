/**
 * Full AppMenuBar -- File / Edit / View / Window / Help.
 *
 * The macOS menu adds an `appMenu` slot up front (with About + Preferences +
 * Quit) because Apple's HIG mandates that pattern. Win/Linux skip it.
 */
import { Menu, MenuItemConstructorOptions, shell, app } from 'electron';
import { BRAND } from './brand';

export type AppMenuHandlers = {
  onAbout: () => void;
  onPreferences: () => void;
  /** User-initiated update check (electron-updater). Surfaces feedback even when
   *  already up to date, unlike the silent boot check. */
  onCheckForUpdates: () => void;
  onOpenDocs: () => void;
  onReportBug: () => void;
  onGotoLogin: () => void;
  onPasskeySignin: () => void;
  onGotoSignup: () => void;
};

export type AppMenuOptions = {
  /** Current renderer pathname, used to surface auth actions in the File menu
   *  only while on the login / signup screens. */
  route?: string;
  /** Dev build. Surfaces Reload / Force-Reload / Toggle-DevTools in the View
   *  menu; in production those are hidden (a reload drops the user into a blank
   *  shell, and exposing devtools is a footgun). */
  isDev?: boolean;
};

export function buildAppMenu(h: AppMenuHandlers, opts: AppMenuOptions = {}): Menu {
  const isMac = process.platform === 'darwin';
  const isAuthRoute = opts.route === '/login' || opts.route === '/signup';
  const isDev = opts.isDev ?? false;
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: BRAND.displayName,
      submenu: [
        { label: `About ${BRAND.displayName}`, click: h.onAbout },
        // Apple HIG places "Check for Updates…" in the app menu, right under About.
        { label: 'Check for Updates…', click: h.onCheckForUpdates },
        { type: 'separator' },
        // "Settings…" is the modern macOS term (Ventura+ renamed Preferences);
        // Cmd+, stays the system-standard accelerator.
        { label: 'Settings…', accelerator: 'Cmd+,', click: h.onPreferences },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  // On the login / signup screens, expose the auth actions in the File menu too
  // (they fire IPC the renderer handles). Absent on every other route.
  const authFileItems: MenuItemConstructorOptions[] = isAuthRoute
    ? [
        { label: 'Login page', click: h.onGotoLogin },
        { label: 'Sign in with passkey', click: h.onPasskeySignin },
        { label: 'Set up with invite code', click: h.onGotoSignup },
        { type: 'separator' },
      ]
    : [];
  template.push({
    label: '&File',
    submenu: [
      // Other in-app navigation lives in the app's own UI, not the native File
      // menu -- the menu keeps only the auth actions (on auth routes) + the
      // standard window close / quit. (No "New Window": the shell is a single
      // BrowserWindow + WebView with shared per-user state.)
      ...authFileItems,
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  });

  // Canonical Electron Edit menu (electronjs.org/docs → Menu examples). The tail
  // is platform-split: macOS gets pasteAndMatchStyle + the standard Speech
  // submenu; Win/Linux omit those (no-ops there) and use the simpler delete /
  // selectAll grouping. Roles auto-bind accelerators + localise labels.
  template.push({
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' },
            {
              label: 'Speech',
              submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
            },
          ] as MenuItemConstructorOptions[])
        : ([
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: '&View',
    submenu: [
      // Reload / Force-Reload / Toggle-DevTools are DEV-ONLY: in a shipped app a
      // reload drops the user into a blank shell and devtools is a footgun. Zoom
      // + fullscreen are always useful.
      ...(isDev
        ? ([
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])
        : ([] as MenuItemConstructorOptions[])),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      // macOS auto-inserts "Enter Full Screen" into the View menu
      // (NSFullScreenMenuItemEverywhere); adding our own `togglefullscreen` role
      // too renders it TWICE. So our explicit item is Win/Linux-only -- macOS
      // supplies its own.
      ...(isMac
        ? ([] as MenuItemConstructorOptions[])
        : ([{ type: 'separator' }, { role: 'togglefullscreen' }] as MenuItemConstructorOptions[])),
    ],
  });

  // macOS: the built-in `windowMenu` role yields the standard Window menu whose
  // window list (with live titles) AppKit auto-maintains as windows open, close,
  // or retitle -- a hand-rolled submenu ending in `role: 'window'` does NOT
  // populate that list. Win/Linux have no OS-managed window list, so keep an
  // explicit minimize / zoom / close submenu there.
  template.push(
    isMac
      ? { role: 'windowMenu' }
      : {
          label: '&Window',
          submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
        },
  );

  template.push({
    label: '&Help',
    role: 'help',
    submenu: [
      { label: 'Documentation', click: h.onOpenDocs },
      { label: 'Release Notes', click: () => shell.openExternal(`${BRAND.repoUrl}/releases`) },
      { label: 'Report a bug…', click: h.onReportBug },
      { type: 'separator' },
      {
        label: 'View on GitHub',
        click: () => shell.openExternal(BRAND.repoUrl),
      },
      // Win/Linux have no app menu, so the updater + About live here instead.
      ...(isMac
        ? ([] as MenuItemConstructorOptions[])
        : ([
            { type: 'separator' },
            { label: 'Check for Updates…', click: h.onCheckForUpdates },
            { label: `About ${BRAND.displayName} ${app.getVersion()}`, click: h.onAbout },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  return Menu.buildFromTemplate(template);
}
