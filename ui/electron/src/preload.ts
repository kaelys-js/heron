/// <reference lib="dom" />
// ^ The preload runs in the renderer, so it has real DOM access (`document`).
//   The electron tsconfig's `lib` is ES2024-only (main process), so pull in the
//   DOM types just for this file to type the tagElectronChrome() class tagging.
require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below

// Expose a minimal, namespaced IPC bridge for the renderer to listen for
// main-process events (errors, lifecycle, future settings sync). Wraps
// ipcRenderer so the WebView can't access arbitrary channels.
import { ipcRenderer, contextBridge } from 'electron';
import { isAllowedChannel } from './ipc-allowlist';

contextBridge.exposeInMainWorld('electronAPI', {
  on(channel: string, handler: (...args: any[]) => void) {
    if (!isAllowedChannel(channel)) {
      console.warn(`[preload] refused to listen on channel "${channel}"`);
      return () => {};
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});

// Tag <html> so the renderer can opt into Electron-only window chrome: the
// custom title-bar drag strip, the macOS traffic-light clearance, and the
// translucent surfaces that let the window's vibrancy / mica material show
// through (app.css `.is-electron`). Electron-only BY CONSTRUCTION -- this
// preload never runs on web / iOS / Android, so the web build never grows a
// fake title bar. contextIsolation isolates the JS *context*, not the DOM, so
// the class we add is visible to the page's CSS. Set as early as <html> exists
// (else on DOMContentLoaded) so the chrome CSS applies before first paint -- no
// flash of un-inset content under the traffic lights.
function tagElectronChrome(): void {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  root.classList.add('is-electron');
  root.classList.add(
    process.platform === 'darwin' ? 'is-mac' : process.platform === 'win32' ? 'is-win' : 'is-linux',
  );
}
if (document.documentElement) {
  tagElectronChrome();
} else {
  document.addEventListener('DOMContentLoaded', tagElectronChrome, { once: true });
}
