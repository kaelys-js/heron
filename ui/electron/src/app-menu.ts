/**
 * Full AppMenuBar — File / Edit / View / Window / Help.
 *
 * The macOS menu adds an `appMenu` slot up front (with About + Preferences +
 * Quit) because Apple's HIG mandates that pattern. Win/Linux skip it.
 */
import { Menu, MenuItemConstructorOptions, shell, app } from 'electron';
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
      label: 'career-ops',
      submenu: [
        { label: 'About career-ops', click: h.onAbout },
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
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          // The Capacitor electron template only supports one window — log
          // and no-op. If we ever want multi-window we'd revisit setup.ts.
          console.log('[menu] new window requested (not yet supported)');
        },
      },
      { type: 'separator' },
      {
        label: 'Import URL…',
        accelerator: 'CmdOrCtrl+I',
        click: () => {
          // Navigate the WebView to /pipeline so the user lands on the
          // add-URL form. Window-loadURL dispatched from main process.
          const w = require('electron').BrowserWindow.getFocusedWindow();
          if (w) {
            const url = w.webContents.getURL();
            const target = url.replace(/\/[^/]*$/, '') + '/pipeline';
            w.webContents.loadURL(target).catch(() => {});
          }
        },
      },
      {
        label: 'Open Pipeline',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          const w = require('electron').BrowserWindow.getFocusedWindow();
          if (w) {
            const url = w.webContents.getURL();
            const target = new URL(url).origin + '/pipeline';
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
            { label: `About career-ops ${app.getVersion()}`, click: h.onAbout },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  return Menu.buildFromTemplate(template);
}
