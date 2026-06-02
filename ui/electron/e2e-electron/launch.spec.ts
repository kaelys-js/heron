/**
 * launch.spec -- the Electron main process boots, the BrowserWindow
 * opens AND BECOMES VISIBLE, and the WebView loads the dev server.
 *
 * These tests exercise the imperative bootstrap in src/index.ts that
 * unit tests intentionally skip. The extracted pure-logic modules
 * (server-process, deep-links, error-routing, net-polling, tray,
 * background-color, window-bounds) have their own Vitest unit suites;
 * this file verifies they wire together when Electron actually launches.
 *
 * Why the visibility assertion matters: the window is created with
 * `show: false` and only revealed once setup.ts wires its reveal path
 * (ready-to-show / dom-ready / fallback timer). A regression where
 * init() threw (setBackgroundColor(undefined)) left that path unwired,
 * so the window stayed permanently hidden -- yet `app.firstWindow()`
 * still resolved (the window OBJECT exists). Asserting isVisible()===true
 * is the only assertion that actually fails on that bug.
 *
 * A tiny local HTTP server stands in for the vite dev server (pointed at
 * via ELECTRON_DEV_SERVER_URL) so the real load -> dom-ready -> reveal
 * path runs in milliseconds instead of waiting on the fallback timer.
 *
 * Run prerequisites:
 *   pnpm --filter heron-electron run build      # tsgo -> build/src/index.js
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, test } from '@playwright/test';
import { BRAND } from '../src/brand';

let app: ElectronApplication | undefined;
let devServer: Server | undefined;
let devServerUrl = '';

test.beforeAll(async () => {
  // Minimal stand-in for the vite dev server: any 200 text/html response is
  // enough to drive the WebView to dom-ready (and thus trigger the reveal).
  devServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body><main>Heron e2e launch fixture</main></body></html>');
  });
  await new Promise<void>((resolve) => devServer!.listen(0, '127.0.0.1', resolve));
  const { port } = devServer!.address() as AddressInfo;
  devServerUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (!devServer) {
      resolve();
      return;
    }
    devServer.close(() => resolve());
  });
  devServer = undefined;
});

test.beforeEach(async () => {
  // Launch the app DIRECTORY (ui/electron), not build/src/index.js directly.
  // Electron derives app.getAppPath() from the entry: a directory makes it
  // resolve package.json `main` (-> appPath = ui/electron, exactly how `electron .`
  // and the packaged app run). Passing the raw index.js sets appPath to
  // build/src, so getCapacitorElectronConfig() / electron-serve / preload all
  // resolve against the wrong root and the main window is never created. (That
  // mis-launch is why this suite was historically flaky and gated off CI.)
  const appDir = path.resolve(__dirname, '..');
  app = await _electron.launch({
    args: [appDir, '--no-sandbox'],
    timeout: 30_000,
    env: {
      ...process.env,
      // Skip the auto-update check on the e2e launcher path; we test
      // updater wiring in a separate spec.
      NODE_ENV: 'test',
      // Point the WebView at the local fixture instead of vite :5173 so the
      // load -> dom-ready -> reveal path runs immediately.
      ELECTRON_DEV_SERVER_URL: devServerUrl,
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

test('the main window becomes VISIBLE (reveal path runs end-to-end)', async () => {
  // The regression guard. With the setBackgroundColor(undefined) bug, init()
  // threw before the reveal listeners were wired, so the window never showed
  // even though the BrowserWindow object existed. Poll isVisible() rather than
  // assert once -- the reveal happens on dom-ready, a tick after launch.
  await expect
    .poll(
      async () =>
        app!.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          return w ? w.isVisible() : false;
        }),
      { timeout: 15_000, message: 'main window never became visible' },
    )
    .toBe(true);
});

test('the WebView loads the configured dev-server URL', async () => {
  // Proves init() ran far enough to load content (not just create a hidden,
  // empty window) -- the loaded URL must match the fixture origin.
  await expect
    .poll(
      async () =>
        app!.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          return w ? w.webContents.getURL() : '';
        }),
      { timeout: 15_000, message: 'WebView never loaded the dev-server URL' },
    )
    .toContain('127.0.0.1');
});

test('recovers after a renderer-process crash (iOS BootFailureView parity)', async () => {
  // Force the renderer to die. wireCrashRecovery should paint the branded
  // recovery screen and auto-reload the app — instead of leaving a blank
  // window. Proof of recovery: the window comes back un-crashed and reloads
  // the dev fixture (127.0.0.1) within the auto-reload window.
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });

  await expect
    .poll(
      async () =>
        app!.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          // Recovery is complete only when the renderer is no longer crashed AND
          // the real app URL has reloaded. Checking the URL alone can pass while
          // the renderer is still crashed mid-recovery, so the test could go
          // green on a regression that never actually recovers.
          return !!w && !w.webContents.isCrashed() && w.webContents.getURL().includes('127.0.0.1');
        }),
      { timeout: 20_000, message: 'window did not recover after renderer crash' },
    )
    .toBe(true);
});

test('main process registers the get-server-url IPC handler', async () => {
  // Proves bootstrap registered the invoke handler. ipcMain.handle() stores
  // handlers in a private map that ipcMain.eventNames() does NOT list, so we
  // detect an existing handler the only reliable way: re-registering the same
  // channel throws ("Attempted to register a second handler"). If no handler
  // existed we'd add then immediately remove a dummy (leaving state untouched).
  const channel = `${BRAND.name}:get-server-url`;
  const alreadyRegistered = await app!.evaluate(({ ipcMain }, ch) => {
    try {
      ipcMain.handle(ch, () => undefined);
      ipcMain.removeHandler(ch); // we just added it -> clean it back up
      return false;
    } catch {
      return true; // a handler was already registered during bootstrap
    }
  }, channel);
  expect(alreadyRegistered).toBe(true);
});

test('preload relays the File-menu IPC channels to the renderer (the fix)', async () => {
  // Regression guard for the File-menu auth items (Login page / Sign in with
  // passkey / Set up with invite code). Pre-fix, electronAPI.on() refused the
  // `<brand>:menu:navigate` / `:menu:passkey` channels (allowlist) and returned
  // a no-op, so the renderer bridge never registered and clicking the items did
  // nothing. Register listeners in the renderer, send from main, assert ARRIVAL.
  const window = await app!.firstWindow();
  const navChannel = `${BRAND.name}:menu:navigate`;
  const passkeyChannel = `${BRAND.name}:menu:passkey`;

  await window.evaluate(
    ({ nav, passkey }) => {
      const w = window as unknown as {
        __menuNav?: unknown;
        __menuPasskey?: boolean;
        electronAPI?: { on?: (c: string, h: (...a: unknown[]) => void) => unknown };
      };
      w.__menuNav = undefined;
      w.__menuPasskey = false;
      w.electronAPI?.on?.(nav, (path: unknown) => {
        w.__menuNav = path;
      });
      w.electronAPI?.on?.(passkey, () => {
        w.__menuPasskey = true;
      });
    },
    { nav: navChannel, passkey: passkeyChannel },
  );

  await app!.evaluate(
    ({ BrowserWindow }, { nav, passkey }) => {
      const wc = BrowserWindow.getAllWindows()[0]?.webContents;
      wc?.send(nav, '/signup');
      wc?.send(passkey);
    },
    { nav: navChannel, passkey: passkeyChannel },
  );

  await expect
    .poll(
      async () => window.evaluate(() => (window as unknown as { __menuNav?: unknown }).__menuNav),
      {
        timeout: 5_000,
        message: 'menu:navigate never reached the renderer (preload allowlist?)',
      },
    )
    .toBe('/signup');
  const gotPasskey = await window.evaluate(
    () => (window as unknown as { __menuPasskey?: boolean }).__menuPasskey,
  );
  expect(gotPasskey, 'menu:passkey never reached the renderer').toBe(true);
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
