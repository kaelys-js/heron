/**
 * career-ops desktop — Electron main process.
 *
 * Responsibilities (in boot order):
 *
 *   1. Spawn the embedded Node SvelteKit server (the same `build/index.js`
 *      that adapter-node produces). Pick a free port at random; pass the
 *      resolved URL into the WebView via preload's `window.__CAREER_OPS__`.
 *
 *   2. Advertise the running server on the local network via mDNS
 *      (`_career-ops._tcp.local`) so an iOS app on the same wifi can
 *      auto-discover it through the same backend-discovery resolver.
 *
 *   3. Wait for `/api/health` to respond, then create the BrowserWindow.
 *
 *   4. Install the full AppMenuBar (File / Edit / View / Window / Help)
 *      and a system Tray with live quick-glance stats.
 *
 *   5. Wire `careerops://job/abc` deep links (custom protocol) to
 *      `mainWindow.loadURL(backend + '/job/abc')`.
 *
 *   6. Auto-update via electron-updater + GitHub Releases.
 */
import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import { app, BrowserWindow, Menu, Notification, Tray, dialog, shell, ipcMain } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import { fork, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { buildAppMenu } from './app-menu';
import { CareerOpsTray } from './tray';
import { startMdnsAdvertise } from './mdns';
import { BRAND } from './brand';

unhandled();

const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

/** State held by the main process. */
type AppState = {
  serverProcess?: ChildProcess;
  serverPort?: number;
  serverUrl?: string;
  tray?: CareerOpsTray;
  mainWindow?: BrowserWindow;
};
const state: AppState = {};

/** Find a free TCP port the kernel will let us bind to. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = (srv.address() as any)?.port;
      srv.close(() => resolve(port));
    });
  });
}

/** Probe a URL — returns true if /api/health returns 2xx within timeoutMs. */
function probeHealth(url: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const u = new URL('/api/health', url);
    const req = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', timeout: timeoutMs }, (res) => {
      resolve((res.statusCode ?? 0) >= 200 && res.statusCode! < 300);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Poll /api/health until it answers or we hit the timeout. */
async function waitForServer(url: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth(url, 500)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Spawn the embedded Node server. In dev mode (electronIsDev) we don't
 * spawn anything — we expect the user to run `pnpm dev` separately and
 * the resolver to discover localhost:5173. In prod (packaged app) we
 * spawn `build/index.js` (adapter-node output) on a random free port.
 */
async function startEmbeddedServer(): Promise<string | undefined> {
  if (electronIsDev) {
    // Resolver will hit localhost:5173 via the dev fallback.
    console.log('[main] dev mode — skipping embedded server spawn');
    return undefined;
  }
  const buildEntry = path.join(__dirname, '..', '..', 'app', 'server', 'index.js');
  if (!existsSync(buildEntry)) {
    console.warn(`[main] embedded server entry not found at ${buildEntry} — falling back to resolver discovery`);
    return undefined;
  }
  const port = await findFreePort();
  state.serverPort = port;
  state.serverProcess = fork(buildEntry, [], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: `http://127.0.0.1:${port}` },
    silent: false,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  state.serverProcess.on('exit', (code) => {
    console.warn(`[main] embedded server exited with code ${code}`);
    state.serverProcess = undefined;
    if (code !== 0 && state.mainWindow && !state.mainWindow.isDestroyed()) {
      dialog.showErrorBox(`${BRAND.displayName} backend stopped`, `The embedded server exited unexpectedly (code ${code}). Restart the app.`);
    }
  });
  const url = `http://127.0.0.1:${port}`;
  const healthy = await waitForServer(url, 15000);
  if (!healthy) {
    throw new Error(`Embedded server failed to become healthy at ${url} within 15s`);
  }
  state.serverUrl = url;
  console.log(`[main] embedded server up at ${url}`);
  return url;
}

const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);

if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: BRAND.urlScheme,
  });
}

if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// ipcMain bridge — preload calls these to interact with the main process.
ipcMain.handle(`${BRAND.name}:get-server-url`, () => state.serverUrl);
ipcMain.handle(`${BRAND.name}:show-notification`, (_e, opts: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title: opts.title, body: opts.body });
    n.show();
    return true;
  }
  return false;
});

(async () => {
  await app.whenReady();

  // 1. Embedded server
  try {
    await startEmbeddedServer();
  } catch (e) {
    console.error('[main] failed to start embedded server', e);
    // Don't bail — the WebView's resolver may still find a remote backend.
  }

  // 2. mDNS advertise (only if we have an embedded server)
  if (state.serverPort) {
    try {
      startMdnsAdvertise({ name: BRAND.name, port: state.serverPort });
    } catch (e) {
      console.warn('[main] mDNS advertise failed', e);
    }
  }

  // 3. Security CSP + WebView init
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  await myCapacitorApp.init();
  state.mainWindow = myCapacitorApp.getMainWindow();

  // Inject embedded URL into the WebView via window.__CAREER_OPS__
  if (state.serverUrl && state.mainWindow) {
    state.mainWindow.webContents.executeJavaScript(`window.__CAREER_OPS__ = { embeddedUrl: ${JSON.stringify(state.serverUrl)} };`).catch(() => {});
  }

  // 4. Full app menu
  Menu.setApplicationMenu(buildAppMenu({
    onPreferences: () => state.mainWindow?.webContents.loadURL((state.serverUrl ?? 'http://localhost:5173') + '/settings'),
    onAbout: () => {
      dialog.showMessageBox({
        type: 'info',
        title: `About ${BRAND.displayName}`,
        message: BRAND.displayName,
        detail: `Version: ${app.getVersion()}\nBundle: ${BRAND.bundleId}\nBackend: ${state.serverUrl ?? 'remote'}`,
      });
    },
    onOpenDocs: () => shell.openExternal(BRAND.repoUrl),
    onReportBug: () => shell.openExternal(`${BRAND.issuesUrl}/new`),
  }));

  // 5. Tray
  state.tray = new CareerOpsTray({
    getBackendUrl: () => state.serverUrl ?? 'http://localhost:5173',
    onOpen: () => {
      state.mainWindow?.show();
      state.mainWindow?.focus();
    },
    onQuit: () => app.quit(),
  });
  state.tray.start();

  // 6. Auto-update
  autoUpdater.checkForUpdatesAndNotify();
})();

app.on('window-all-closed', () => {
  // Mac: keep app running in menu bar via Tray (don't quit).
  // Win/Linux: quit on window close.
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});

app.on('activate', async () => {
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
    state.mainWindow = myCapacitorApp.getMainWindow();
  } else {
    state.mainWindow?.show();
  }
});

app.on('before-quit', () => {
  cleanup();
});

function cleanup() {
  state.tray?.stop();
  if (state.serverProcess && !state.serverProcess.killed) {
    state.serverProcess.kill('SIGTERM');
    // Give it 2s to clean up, then SIGKILL.
    setTimeout(() => {
      if (state.serverProcess && !state.serverProcess.killed) state.serverProcess.kill('SIGKILL');
    }, 2000);
  }
}
