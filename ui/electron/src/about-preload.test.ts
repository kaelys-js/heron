/**
 * about-preload.test -- the About window's contextBridge preload. The module
 * exposes its bridge at import time, so we mock electron + ./brand, import it,
 * and assert the bridge shape + that each method sends on the brand-namespaced
 * channel wireAboutIpc() (about-window.ts) listens on. resetModules so each
 * import re-runs the top-level exposeInMainWorld.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __expose = vi.fn();
const __send = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: __expose },
  ipcRenderer: { send: __send },
}));

vi.mock('./brand', () => ({ BRAND: { name: 'heron' } }));

beforeEach(() => {
  __expose.mockReset();
  __send.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadBridge() {
  await import('./about-preload.js');
  expect(__expose).toHaveBeenCalledTimes(1);
  const [name, api] = __expose.mock.calls[0];
  return { name, api } as { name: string; api: Record<string, (...a: unknown[]) => void> };
}

describe('about-preload -- module-load behaviour', () => {
  it('exposes __aboutBridge__ with openExternal/copy/close', async () => {
    const { name, api } = await loadBridge();
    expect(name).toBe('__aboutBridge__');
    expect(typeof api.openExternal).toBe('function');
    expect(typeof api.copy).toBe('function');
    expect(typeof api.close).toBe('function');
  });

  it('openExternal forwards the url on the brand-namespaced open-external channel', async () => {
    const { api } = await loadBridge();
    api.openExternal('https://heron.app');
    expect(__send).toHaveBeenCalledWith('heron:about:open-external', 'https://heron.app');
  });

  it('copy forwards the payload on the copy channel', async () => {
    const { api } = await loadBridge();
    api.copy('Heron 1.0.0\nElectron 39');
    expect(__send).toHaveBeenCalledWith('heron:about:copy', 'Heron 1.0.0\nElectron 39');
  });

  it('close sends the close channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.close();
    expect(__send).toHaveBeenCalledWith('heron:about:close');
  });
});
