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
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  dialog,
  shell,
  ipcMain,
  net,
} from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { buildAppMenu } from './app-menu';
import { openAboutWindow, readLogoDataUri } from './about-window';
import { wireCrashRecovery } from './crash-recovery';
import { DesktopTray } from './tray';
import { startMdnsAdvertise } from './mdns';
import { BRAND } from './brand';
import { startEmbeddedServer, stopEmbeddedServer } from './server-process';
import type { ServerHandle } from './server-process';
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

// Brand the OS-level app identity BEFORE any window / Dock / notification
// appears. In an unpackaged dev run (`pnpm dev:desktop`) macOS otherwise
// shows the Electron helper's name ("Electron"); electron-builder's
// productName only applies to packaged builds. Both setName and the Windows
// AppUserModelId (AUMID -- taskbar grouping + toast attribution) MUST be set
// before app.whenReady() / the first Notification, so they live here at
// module top, not inside the post-ready IIFE.
app.setName(BRAND.displayName);
if (process.platform === 'win32') {
  try {
    app.setAppUserModelId(BRAND.bundleId);
  } catch {
    /* non-fatal -- toasts still show, just with the wrong app label */
  }
}

const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);

if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  // setupElectronDeepLinking ALSO calls requestSingleInstanceLock(),
  // registers its own 'second-instance' handler (focus window + forward the
  // deep link), and setAsDefaultProtocolClient. It OWNS single-instance --
  // calling requestSingleInstanceLock() again here would register a second,
  // racing handler, so we don't.
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: BRAND.urlScheme,
  });
} else {
  // Deep linking off -> no helper to own single-instance. Do it here so a
  // re-launch focuses the existing window instead of spawning a second
  // hidden instance (on macOS window-all-closed keeps the app in the tray).
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const w = state.mainWindow;
      if (w && !w.isDestroyed()) {
        if (w.isMinimized()) {
          w.restore();
        }
        w.show();
        w.focus();
      }
    });
  }
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

  // macOS Dock identity (dev AND packaged). The BrowserWindow `icon` option
  // does NOT affect the Dock -- only app.dock.setIcon does. Prefer the
  // multi-resolution .icns (full-size, correctly padded macOS tile) over the
  // small 512 .png, which the Dock rendered undersized/inset in dev. Both are
  // apply-brand outputs (regenerated from branding/brand.json).
  if (process.platform === 'darwin' && app.dock) {
    try {
      const icnsPath = path.join(app.getAppPath(), 'build', 'icon.icns');
      const pngPath = path.join(app.getAppPath(), 'build', 'icon.png');
      const dockIcon = nativeImage.createFromPath(icnsPath);
      app.dock.setIcon(dockIcon.isEmpty() ? nativeImage.createFromPath(pngPath) : dockIcon);
    } catch {
      /* non-fatal -- Dock keeps the default icon */
    }
  }
  // Brand the standard About panel (app menu -> About). Electron uses the
  // fields each platform supports: copyright everywhere, website + iconPath
  // on Linux. All values derive from branding/brand.json via brand.ts.
  app.setAboutPanelOptions({
    applicationName: BRAND.displayName,
    applicationVersion: app.getVersion(),
    copyright: BRAND.copyright,
    website: BRAND.homepageUrl,
    iconPath: path.join(app.getAppPath(), 'build', 'icon.png'),
  });

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

  // Global crash recovery (iOS BootFailureView parity): if the renderer
  // process dies, show a branded recovery screen + auto-reload (with a
  // crash-loop guard) instead of leaving a blank window.
  if (state.mainWindow) {
    wireCrashRecovery(state.mainWindow, {
      displayName: BRAND.displayName,
      colors: BRAND.colors,
      logoDataUri: readLogoDataUri(app.getAppPath()),
      reload: () => {
        void myCapacitorApp.reload();
      },
    });

    // Always postfix the window title with the brand ("<page> -- Heron"), so the
    // OS title bar / window switcher shows the app name regardless of what the
    // page set. We own the title (preventDefault) instead of mirroring the
    // raw document.title.
    const win = state.mainWindow;
    const applyTitle = (raw: string): void => {
      const t = (raw ?? '').trim();
      const next =
        t && t !== BRAND.displayName && !t.includes(BRAND.displayName)
          ? `${t} — ${BRAND.displayName}`
          : t || BRAND.displayName;
      if (!win.isDestroyed()) {
        win.setTitle(next);
      }
    };
    win.webContents.on('page-title-updated', (e, title) => {
      e.preventDefault();
      applyTitle(title);
    });
    applyTitle(win.getTitle());
  }

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
          `${state.server?.url ?? 'http://localhost:5173'}/settings`,
        ),
      onAbout: () => {
        openAboutWindow({
          brandName: BRAND.name,
          preloadPath: path.join(app.getAppPath(), 'build', 'src', 'about-preload.js'),
          parent: state.mainWindow,
          info: {
            displayName: BRAND.displayName,
            tagline: BRAND.tagline,
            description: BRAND.description,
            version: app.getVersion(),
            versions: {
              electron: process.versions.electron ?? '',
              chromium: process.versions.chrome ?? '',
              node: process.versions.node ?? '',
            },
            copyright: BRAND.copyright,
            links: [
              { label: 'Website', url: BRAND.homepageUrl },
              { label: 'GitHub', url: BRAND.repoUrl },
              { label: 'Report a bug', url: `${BRAND.issuesUrl}/new` },
              { label: 'License', url: `${BRAND.repoUrl}/blob/main/LICENSE` },
            ],
            colors: BRAND.colors,
            logoDataUri: readLogoDataUri(app.getAppPath()),
            backendUrl: state.server?.url,
          },
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
      if (!state.mainWindow) {
        return;
      }
      state.mainWindow.show();
      state.mainWindow.focus();
      const url = resolveDeepLink(subPath, state.server?.url ?? 'http://localhost:5173');
      if (url) {
        void state.mainWindow.loadURL(url);
      }
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
  // Close == quit on EVERY platform (including macOS). The user expects
  // closing the window to quit the app, not leave it running invisibly in the
  // tray, and it lets `pnpm dev:desktop` tear down cleanly when the window is
  // closed (not just on Dock-quit).
  cleanup();
  app.quit();
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
