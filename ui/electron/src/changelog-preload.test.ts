/**
 * changelog-preload.test -- the "What's New" window's contextBridge preload.
 * The module exposes its bridge at import time, so we mock electron + ./brand,
 * import it, and assert the bridge shape + that each method sends on the
 * brand-namespaced channel wireChangelogIpc() (changelog-window.ts) listens on.
 * resetModules so each import re-runs the top-level exposeInMainWorld.
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
  await import('./changelog-preload.js');
  expect(__expose).toHaveBeenCalledTimes(1);
  const [name, api] = __expose.mock.calls[0];
  return { name, api } as { name: string; api: Record<string, (...a: unknown[]) => void> };
}

describe('changelog-preload -- module-load behaviour', () => {
  it('exposes __changelogBridge__ with openExternal/download/install/skip/close', async () => {
    const { name, api } = await loadBridge();
    expect(name).toBe('__changelogBridge__');
    expect(typeof api.openExternal).toBe('function');
    expect(typeof api.download).toBe('function');
    expect(typeof api.install).toBe('function');
    expect(typeof api.skip).toBe('function');
    expect(typeof api.close).toBe('function');
  });

  it('openExternal forwards the url on the brand-namespaced open-external channel', async () => {
    const { api } = await loadBridge();
    api.openExternal('https://heron.app/releases');
    expect(__send).toHaveBeenCalledWith(
      'heron:changelog:open-external',
      'https://heron.app/releases',
    );
  });

  it('download sends the download channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.download();
    expect(__send).toHaveBeenCalledWith('heron:changelog:download');
  });

  it('install sends the install channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.install();
    expect(__send).toHaveBeenCalledWith('heron:changelog:install');
  });

  it('skip sends the skip channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.skip();
    expect(__send).toHaveBeenCalledWith('heron:changelog:skip');
  });

  it('close sends the close channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.close();
    expect(__send).toHaveBeenCalledWith('heron:changelog:close');
  });
});
