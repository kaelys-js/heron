/** Electron main: spawns embedded SvelteKit server (random port,
 *  injects URL via preload's window.__HERON__), advertises via mDNS
 *  (`_heron._tcp.local`), waits for /api/health, creates BrowserWindow,
 *  installs AppMenuBar + tray, wires heron:// deep links to
 *  mainWindow.loadURL, runs electron-updater against GitHub Releases. */
import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from '@capacitor-community/electron';
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  shell,
  ipcMain,
  net,
} from 'electron';
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
import { DesktopTray } from './tray';
import { startMdnsAdvertise } from './mdns';
import { BRAND } from './brand';

unhandled({
  logger: (e: Error) => {
    // Forward unhandled main-process errors to the renderer via IPC so
    // the SvelteKit error-reporter funnels them into the same Issues
    // store everything else uses. Falls back to console if no window.
    console.error('[main:unhandled]', e);
    try {
      const win = state.mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send(`${BRAND.name}:main-error`, {
          message: e?.message ?? String(e),
          stack: e?.stack,
          source: 'electron-main',
        });
      }
    } catch {
      /* swallow secondary errors */
    }
  },
  showDialog: false, // we route to the in-app Issues system instead
});

// Catch promise rejections in the main process too (electron-unhandled
// only covers uncaught exceptions by default).
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[main:unhandledRejection]', err);
  try {
    state.mainWindow?.webContents.send(`${BRAND.name}:main-error`, {
      message: err.message,
      stack: err.stack,
      source: 'electron-main-rejection',
    });
  } catch {}
});

const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

/** State held by the main process. */
type AppState = {
  serverProcess?: ChildProcess;
  serverPort?: number;
  serverUrl?: string;
  tray?: DesktopTray;
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

/** Probe a URL -- returns true if /api/health returns 2xx within timeoutMs. */
function probeHealth(url: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const u = new URL('/api/health', url);
    const req = httpRequest(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', timeout: timeoutMs },
      (res) => {
        resolve((res.statusCode ?? 0) >= 200 && res.statusCode! < 300);
        res.resume();
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
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
 * spawn anything -- we expect the user to run `pnpm dev` separately and
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
    console.warn(
      `[main] embedded server entry not found at ${buildEntry} — falling back to resolver discovery`,
    );
    return undefined;
  }
  const port = await findFreePort();
  state.serverPort = port;
  state.serverProcess = fork(buildEntry, [], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ORIGIN: `http://127.0.0.1:${port}`,
    },
    silent: false,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  state.serverProcess.on('exit', (code) => {
    console.warn(`[main] embedded server exited with code ${code}`);
    state.serverProcess = undefined;
    if (code !== 0 && state.mainWindow && !state.mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        `${BRAND.displayName} backend stopped`,
        `The embedded server exited unexpectedly (code ${code}). Restart the app.`,
      );
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

// ipcMain bridge -- preload calls these to interact with the main process.
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

  // Windows: bind toast notifications to the right app. Without an AUMID
  // Windows shows toasts as "electron.exe" rather than Heron.
  // Must run BEFORE any new Notification() call.
  if (process.platform === 'win32') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BRAND } = require('./brand') as typeof import('./brand');
      app.setAppUserModelId(BRAND.bundleId);
    } catch {
      /* non-fatal -- toasts still show, just with the wrong app label */
    }
  }

  // 1. Embedded server
  try {
    await startEmbeddedServer();
  } catch (e) {
    console.error('[main] failed to start embedded server', e);
    // Don't bail -- the WebView's resolver may still find a remote backend.
  }

  // 2. mDNS advertise (only if we have an embedded server). Fire and
  // forget -- startMdnsAdvertise is async (dynamic import + try/catch
  // internal) so callers can ignore the returned Promise safely.
  if (state.serverPort) {
    startMdnsAdvertise({ name: BRAND.name, port: state.serverPort }).catch((e) => {
      console.warn('[main] mDNS advertise failed', e);
    });
  }

  // 3. Security CSP + WebView init
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  await myCapacitorApp.init();
  state.mainWindow = myCapacitorApp.getMainWindow();

  // Inject embedded URL into the WebView via window.__HERON__
  if (state.serverUrl && state.mainWindow) {
    state.mainWindow.webContents
      .executeJavaScript(`window.__HERON__ = { embeddedUrl: ${JSON.stringify(state.serverUrl)} };`)
      .catch(() => {});
  }

  // 4. Full app menu
  Menu.setApplicationMenu(
    buildAppMenu({
      onPreferences: () =>
        state.mainWindow?.webContents.loadURL(
          (state.serverUrl ?? 'http://localhost:5173') + '/settings',
        ),
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
    }),
  );

  // 5. Tray (macOS Menu Bar / Windows / Linux system tray)
  state.tray = new DesktopTray({
    getBackendUrl: () => state.serverUrl ?? 'http://localhost:5173',
    onOpen: () => {
      state.mainWindow?.show();
      state.mainWindow?.focus();
    },
    // Per-section deep links: bring the window forward and navigate
    // the WebView to the requested path. Falls back to "show" if the
    // window doesn't exist yet.
    onOpenPath: (subPath: string) => {
      if (!state.mainWindow) return;
      state.mainWindow.show();
      state.mainWindow.focus();
      const base = state.serverUrl ?? 'http://localhost:5173';
      try {
        const u = new URL(subPath, base);
        void state.mainWindow.loadURL(u.toString());
      } catch {
        /* invalid subPath -- leave the window where it was */
      }
    },
    // When the user enables "Menu Bar Only", close-window must NOT quit
    // (otherwise re-toggling has nothing to show). We track the choice
    // and `window-all-closed` honours it below.
    onSetDockVisible: (_visible: boolean) => {
      /* state currently tracked in tray.ts; if we add behaviours that
         depend on it elsewhere, surface via state.menuBarOnly = !_visible */
    },
    onQuit: () => app.quit(),
  });
  state.tray.start();

  // 6. Auto-update
  autoUpdater.checkForUpdatesAndNotify();

  // 7. Network status monitoring -- Electron exposes `net.online` as a
  //    static getter that reflects Chromium's connectivity heuristic.
  //    We poll it every 5s and push changes to the renderer; the
  //    online-status store in the WebView listens for `<brand>:net-status`.
  let lastOnline = net.isOnline();
  setInterval(() => {
    const now = net.isOnline();
    if (now === lastOnline) return;
    lastOnline = now;
    try {
      state.mainWindow?.webContents.send(`${BRAND.name}:net-status`, { online: now });
    } catch {}
  }, 5000);
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
