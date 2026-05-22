/**
 * launch.spec -- the Electron main process boots, the BrowserWindow
 * opens, and the WebView attempts to load the embedded server (or
 * falls back gracefully to a remote backend).
 *
 * These tests exercise the imperative bootstrap in src/index.ts that
 * unit tests intentionally skip. The extracted pure-logic modules
 * (server-process, deep-links, error-routing, net-polling, tray)
 * have their own Vitest unit suites; this file verifies they wire
 * together when Electron actually launches.
 *
 * Run prerequisites:
 *   pnpm --filter heron-electron run build      # tsgo -> build/src/index.js
 *   (and a SvelteKit static build for the WebView, but not strictly
 *    needed for the cold-launch assertions below -- those exercise
 *    the main process, not the renderer)
 */
import { _electron, type ElectronApplication, expect, test } from '@playwright/test';
import path from 'node:path';

let app: ElectronApplication | undefined;

test.beforeEach(async () => {
  // Resolve the built main entry relative to this spec file.
  // Layout: ui/electron/build/src/index.js (tsgo emit)
  //         ui/electron/e2e-electron/launch.spec.ts
  const mainEntry = path.resolve(__dirname, '..', 'build', 'src', 'index.js');
  app = await _electron.launch({
    args: [mainEntry, '--no-sandbox'],
    timeout: 30_000,
    env: {
      ...process.env,
      // Skip the auto-update check on the e2e launcher path; we test
      // updater wiring in a separate spec.
      NODE_ENV: 'test',
    },
  });
});

test.afterEach(async () => {
  await app?.close().catch(() => {
    /* swallow close errors */
  });
  app = undefined;
});

test('main process launches without throwing', async () => {
  expect(app).toBeDefined();
});

test('a BrowserWindow is created', async () => {
  // app.firstWindow waits up to the default timeout for one to open.
  const window = await app!.firstWindow();
  expect(window).toBeDefined();
});

test('main process exposes the get-server-url IPC handler', async () => {
  // Invoke the ipcMain handler from the main process via app.evaluate.
  // This proves the handler was registered during bootstrap.
  const url = await app!.evaluate(async ({ ipcMain }) => {
    // ipcMain doesn't expose a "is X registered" API; we test by
    // attempting to fire a handler. The web-side preload would invoke
    // ipcRenderer.invoke('<brand>:get-server-url'). From the main
    // process side, we can detect the handler exists by looking at
    // the listener count for the wrapped channel.
    const channels = ipcMain.eventNames();
    return channels.find((c) => String(c).endsWith(':get-server-url')) ?? null;
  });
  expect(url).not.toBeNull();
});

test('window-all-closed handler is wired', async () => {
  // Verify the app responds to window-all-closed by inspecting the
  // registered listeners on the `app` module.
  const hasListener = await app!.evaluate(async ({ app: electronApp }) => {
    return electronApp.listenerCount('window-all-closed') > 0;
  });
  expect(hasListener).toBe(true);
});

test('activate handler is wired', async () => {
  const hasListener = await app!.evaluate(async ({ app: electronApp }) => {
    return electronApp.listenerCount('activate') > 0;
  });
  expect(hasListener).toBe(true);
});

test('before-quit handler is wired (cleanup path)', async () => {
  const hasListener = await app!.evaluate(async ({ app: electronApp }) => {
    return electronApp.listenerCount('before-quit') > 0;
  });
  expect(hasListener).toBe(true);
});
