/** Electron main: spawns embedded SvelteKit server, advertises via
 *  mDNS, waits for /api/health, creates BrowserWindow, installs
 *  AppMenuBar + tray, wires deep links, runs electron-updater.
 *
 *  Bootstrap orchestrator: heavy lifting lives in extracted, unit-
 *  tested modules (server-process, deep-links, error-routing, net-
 *  polling, tray). e2e-electron/ exercises the orchestration end-
 *  to-end against the packaged app. */
import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from '@capacitor-community/electron';
import { app, BrowserWindow, Menu, Notification, dialog, shell, ipcMain, net } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { buildAppMenu } from './app-menu';
import { DesktopTray } from './tray';
import { startMdnsAdvertise } from './mdns';
import { BRAND } from './brand';
import { startEmbeddedServer, stopEmbeddedServer, type ServerHandle } from './server-process';
import { resolveDeepLink } from './deep-links';
import { buildUnhandledErrorHandler, buildUnhandledRejectionHandler } from './error-routing';
import { startNetPoller } from './net-polling';

/** State held by the main process. */
type AppState = {
  server?: ServerHandle;
  tray?: DesktopTray;
  mainWindow?: BrowserWindow;
  stopNetPoller?: () => void;
};
const state: AppState = {};

// ── Error routing (forward main-process errors to the renderer) ───
const errorOpts = {
  brandName: BRAND.name,
  getMainWindow: () => state.mainWindow,
};
unhandled({
  logger: buildUnhandledErrorHandler(errorOpts),
  showDialog: false,
});
process.on('unhandledRejection', buildUnhandledRejectionHandler(errorOpts));

const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

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
ipcMain.handle(`${BRAND.name}:get-server-url`, () => state.server?.url);
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
  // Windows shows toasts as "electron.exe" rather than the brand display
  // name. Must run BEFORE any new Notification() call.
  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId(BRAND.bundleId);
    } catch {
      /* non-fatal -- toasts still show, just with the wrong app label */
    }
  }

  // 1. Embedded server
  try {
    if (!electronIsDev) {
      const entry = path.join(__dirname, '..', '..', 'app', 'server', 'index.js');
      const handle = await startEmbeddedServer({ entryPath: entry });
      if (handle) {
        state.server = handle;
        // Surface non-zero exits to the user.
        handle.process.on('exit', (code) => {
          console.warn(`[main] embedded server exited with code ${code}`);
          state.server = undefined;
          if (code !== 0 && state.mainWindow && !state.mainWindow.isDestroyed()) {
            dialog.showErrorBox(
              `${BRAND.displayName} backend stopped`,
              `The embedded server exited unexpectedly (code ${code}). Restart the app.`,
            );
          }
        });
      } else {
        console.warn('[main] embedded server entry not found -- falling back to resolver');
      }
    }
  } catch (e) {
    console.error('[main] failed to start embedded server', e);
    // Don't bail -- the WebView's resolver may still find a remote backend.
  }

  // 2. mDNS advertise (only if we have an embedded server). Fire and
  // forget -- startMdnsAdvertise handles its own try/catch internally.
  if (state.server?.port) {
    startMdnsAdvertise({ name: BRAND.name, port: state.server.port }).catch((e) => {
      console.warn('[main] mDNS advertise failed', e);
    });
  }

  // 3. Security CSP + WebView init
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  await myCapacitorApp.init();
  state.mainWindow = myCapacitorApp.getMainWindow();

  // Inject embedded URL into the WebView via window.__HERON__
  if (state.server && state.mainWindow) {
    state.mainWindow.webContents
      .executeJavaScript(`window.__HERON__ = { embeddedUrl: ${JSON.stringify(state.server.url)} };`)
      .catch(() => {});
  }

  // 4. Full app menu
  Menu.setApplicationMenu(
    buildAppMenu({
      onPreferences: () =>
        state.mainWindow?.webContents.loadURL(
          (state.server?.url ?? 'http://localhost:5173') + '/settings',
        ),
      onAbout: () => {
        dialog.showMessageBox({
          type: 'info',
          title: `About ${BRAND.displayName}`,
          message: BRAND.displayName,
          detail: `Version: ${app.getVersion()}\nBundle: ${BRAND.bundleId}\nBackend: ${state.server?.url ?? 'remote'}`,
        });
      },
      onOpenDocs: () => shell.openExternal(BRAND.repoUrl),
      onReportBug: () => shell.openExternal(`${BRAND.issuesUrl}/new`),
    }),
  );

  // 5. Tray (macOS Menu Bar / Windows / Linux system tray)
  state.tray = new DesktopTray({
    getBackendUrl: () => state.server?.url ?? 'http://localhost:5173',
    onOpen: () => {
      state.mainWindow?.show();
      state.mainWindow?.focus();
    },
    onOpenPath: (subPath: string) => {
      if (!state.mainWindow) return;
      state.mainWindow.show();
      state.mainWindow.focus();
      const url = resolveDeepLink(subPath, state.server?.url ?? 'http://localhost:5173');
      if (url) void state.mainWindow.loadURL(url);
    },
    onSetDockVisible: () => {
      /* state currently tracked in tray.ts; no cross-module wiring needed yet */
    },
    onQuit: () => app.quit(),
  });
  state.tray.start();

  // 6. Auto-update against GitHub Releases.
  autoUpdater.checkForUpdatesAndNotify();

  // 7. Network status monitoring -- Electron exposes `net.isOnline()` as
  // a static getter that reflects Chromium's connectivity heuristic. The
  // poller fires onChange only on transition (dedup); the renderer
  // listens for `<brand>:net-status` and updates the online-status store.
  state.stopNetPoller = startNetPoller({
    isOnline: () => net.isOnline(),
    onChange: (online) => {
      try {
        state.mainWindow?.webContents.send(`${BRAND.name}:net-status`, { online });
      } catch {
        /* swallow secondary errors */
      }
    },
  });
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

function cleanup(): void {
  state.tray?.stop();
  state.stopNetPoller?.();
  if (state.server) {
    stopEmbeddedServer(state.server);
    state.server = undefined;
  }
}
