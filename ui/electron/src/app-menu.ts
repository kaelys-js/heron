/**
 * Full AppMenuBar -- File / Edit / View / Window / Help.
 *
 * The macOS menu adds an `appMenu` slot up front (with About + Preferences +
 * Quit) because Apple's HIG mandates that pattern. Win/Linux skip it.
 */
import { BrowserWindow, Menu, MenuItemConstructorOptions, shell, app } from 'electron';
import { BRAND } from './brand';

export type AppMenuHandlers = {
  onAbout: () => void;
  onPreferences: () => void;
  onOpenDocs: () => void;
  onReportBug: () => void;
};

export function buildAppMenu(h: AppMenuHandlers): Menu {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: BRAND.displayName,
      submenu: [
        { label: `About ${BRAND.displayName}`, click: h.onAbout },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: h.onPreferences },
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

  template.push({
    label: '&File',
    submenu: [
      // Deliberately no "New Window" -- the Capacitor electron template
      // wraps a single BrowserWindow + a single WebView instance with
      // shared per-user state. Spawning a second window would either
      // duplicate the SvelteKit hydration (breaks AsyncLocalStorage on
      // the server side) or share the WebView (breaks the user's
      // expectation of independent windows). Multi-window is a real
      // refactor (fork Capacitor electron template) that we won't ship
      // half-implemented as a no-op menu item.
      {
        label: 'Import URL…',
        accelerator: 'CmdOrCtrl+I',
        click: () => {
          // Navigate the WebView to /pipeline so the user lands on the
          // add-URL form. Window-loadURL dispatched from main process.
          const w = BrowserWindow.getFocusedWindow();
          if (w) {
            const url = w.webContents.getURL();
            const target = `${url.replace(/\/[^/]*$/, '')}/pipeline`;
            w.webContents.loadURL(target).catch(() => {});
          }
        },
      },
      {
        label: 'Open Pipeline',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          const w = BrowserWindow.getFocusedWindow();
          if (w) {
            const url = w.webContents.getURL();
            const target = `${new URL(url).origin}/pipeline`;
            w.webContents.loadURL(target).catch(() => {});
          }
        },
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  });

  template.push({
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  });

  template.push({
    label: '&View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: '&Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? ([
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ] as MenuItemConstructorOptions[])
        : ([{ role: 'close' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: '&Help',
    role: 'help',
    submenu: [
      { label: 'Documentation', click: h.onOpenDocs },
      { label: 'Report a bug…', click: h.onReportBug },
      { type: 'separator' },
      {
        label: 'View on GitHub',
        click: () => shell.openExternal(BRAND.repoUrl),
      },
      ...(isMac
        ? ([] as MenuItemConstructorOptions[])
        : ([
            { type: 'separator' },
            { label: `About ${BRAND.displayName} ${app.getVersion()}`, click: h.onAbout },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  return Menu.buildFromTemplate(template);
}
