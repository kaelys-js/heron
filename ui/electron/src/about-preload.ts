/** Preload for the About window. Exposes a tiny, typed bridge so the static
 *  About page can ask the main process to open external links, copy the
 *  version block, and close itself -- without any Node or ipcRenderer access
 *  leaking into the page. Channel names match wireAboutIpc() in about-window.ts.
 *
 *  Runs SANDBOXED (about-window.ts sets sandbox:true). A sandboxed preload can
 *  only `require('electron')` -- it cannot `require('./brand')` -- so the brand
 *  name (the IPC channel namespace) is passed in via webPreferences
 *  additionalArguments and read from process.argv here, instead of importing
 *  brand.ts. apply-brand stays the single source of truth: about-window.ts reads
 *  BRAND.name and forwards it as the argument. */
import { contextBridge, ipcRenderer } from 'electron';

/** Read the brand name forwarded as `--brand-name=<name>` in
 *  webPreferences.additionalArguments. Falls back to 'heron' so the bridge is
 *  still functional if the arg is somehow absent (e.g. a stale build). */
function brandName(): string {
  const prefix = '--brand-name=';
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : 'heron';
}

const name = brandName();

contextBridge.exposeInMainWorld('__aboutBridge__', {
  openExternal: (url: string) => ipcRenderer.send(`${name}:about:open-external`, url),
  copy: (text: string) => ipcRenderer.send(`${name}:about:copy`, text),
  close: () => ipcRenderer.send(`${name}:about:close`),
  whatsNew: () => ipcRenderer.send(`${name}:about:whats-new`),
});
