require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below

// Expose a minimal, namespaced IPC bridge for the renderer to listen for
// main-process events (errors, lifecycle, future settings sync). Wraps
// ipcRenderer so the WebView can't access arbitrary channels.
import { ipcRenderer, contextBridge } from 'electron';

const ALLOWED_CHANNELS = new Set([
  // Match scripts/native/apply-brand.mjs → applyElectronBrandTs(): the brand
  // name is baked at build time. Channels are `<brand>:main-error`, etc.
  // We allow anything ending in `:main-error` for forward compat.
]);

contextBridge.exposeInMainWorld('electronAPI', {
  on(channel: string, handler: (...args: any[]) => void) {
    if (!channel.endsWith(':main-error') && !ALLOWED_CHANNELS.has(channel)) {
      console.warn(`[preload] refused to listen on channel "${channel}"`);
      return () => {};
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
