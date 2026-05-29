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
      // In-app navigation (Import URL / Open Pipeline) lives in the app's own
      // UI, not the native File menu -- the menu keeps only the standard
      // window close / quit. (No "New Window": the shell is a single
      // BrowserWindow + WebView with shared per-user state.)
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
