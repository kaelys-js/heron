/**
 * about-preload.test -- the About window's contextBridge preload. The module
 * exposes its bridge at import time, so we mock electron, set the brand name
 * argument on process.argv (the SANDBOXED preload reads it from there instead
 * of require('./brand')), import it, and assert the bridge shape + that each
 * method sends on the brand-namespaced channel wireAboutIpc() listens on.
 * resetModules so each import re-runs the top-level exposeInMainWorld.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __expose = vi.fn();
const __send = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: __expose },
  ipcRenderer: { send: __send },
}));

let __origArgv: string[];

beforeEach(() => {
  __expose.mockReset();
  __send.mockReset();
  vi.resetModules();
  __origArgv = process.argv;
  // The sandboxed preload reads the brand name from `--brand-name=` in argv
  // (about-window.ts forwards it via webPreferences.additionalArguments).
  process.argv = [...process.argv, '--brand-name=heron'];
});

afterEach(() => {
  process.argv = __origArgv;
  vi.restoreAllMocks();
});

async function loadBridge() {
  await import('./about-preload.js');
  expect(__expose).toHaveBeenCalledTimes(1);
  const [name, api] = __expose.mock.calls[0];
  return { name, api } as { name: string; api: Record<string, (...a: unknown[]) => void> };
}

describe('about-preload -- module-load behaviour', () => {
  it('exposes __aboutBridge__ with openExternal/copy/close/whatsNew', async () => {
    const { name, api } = await loadBridge();
    expect(name).toBe('__aboutBridge__');
    expect(typeof api.openExternal).toBe('function');
    expect(typeof api.copy).toBe('function');
    expect(typeof api.close).toBe('function');
    expect(typeof api.whatsNew).toBe('function');
  });

  it('reads the brand name from --brand-name= argv (sandbox-safe, no require)', async () => {
    const { api } = await loadBridge();
    api.close();
    // The namespace came from the argument, proving the preload didn't need a
    // relative ./brand require (which a sandboxed preload can't do).
    expect(__send).toHaveBeenCalledWith('heron:about:close');
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

  it('whatsNew sends the whats-new channel (no payload)', async () => {
    const { api } = await loadBridge();
    api.whatsNew();
    expect(__send).toHaveBeenCalledWith('heron:about:whats-new');
  });

  it('falls back to the default brand name when the argument is absent', async () => {
    process.argv = __origArgv.filter((a) => !a.startsWith('--brand-name='));
    const { api } = await loadBridge();
    api.close();
    expect(__send).toHaveBeenCalledWith('heron:about:close');
  });
});
