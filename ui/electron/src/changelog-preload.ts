/** Preload for the "What's New" / auto-update window. Exposes a tiny, typed
 *  bridge so the static card can ask the main process to open external links,
 *  trigger the update download / install, and close itself -- without any Node
 *  or ipcRenderer access leaking into the page. Channel names match
 *  wireChangelogIpc() in changelog-window.ts. */
import { contextBridge, ipcRenderer } from 'electron';
import { BRAND } from './brand';

contextBridge.exposeInMainWorld('__changelogBridge__', {
  openExternal: (url: string) => ipcRenderer.send(`${BRAND.name}:changelog:open-external`, url),
  download: () => ipcRenderer.send(`${BRAND.name}:changelog:download`),
  install: () => ipcRenderer.send(`${BRAND.name}:changelog:install`),
  skip: () => ipcRenderer.send(`${BRAND.name}:changelog:skip`),
  close: () => ipcRenderer.send(`${BRAND.name}:changelog:close`),
});
