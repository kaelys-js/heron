/** Preload for the About window. Exposes a tiny, typed bridge so the static
 *  About page can ask the main process to open external links, copy the
 *  version block, and close itself -- without any Node or ipcRenderer access
 *  leaking into the page. Channel names match wireAboutIpc() in about-window.ts. */
import { contextBridge, ipcRenderer } from 'electron';
import { BRAND } from './brand';

contextBridge.exposeInMainWorld('__aboutBridge__', {
  openExternal: (url: string) => ipcRenderer.send(`${BRAND.name}:about:open-external`, url),
  copy: (text: string) => ipcRenderer.send(`${BRAND.name}:about:copy`, text),
  close: () => ipcRenderer.send(`${BRAND.name}:about:close`),
});
