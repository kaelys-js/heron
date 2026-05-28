import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from '@capacitor-community/electron';
import chokidar from 'chokidar';
import type { MenuItemConstructorOptions } from 'electron';
import { app, BrowserWindow, Menu, MenuItem, nativeImage, screen, Tray, session } from 'electron';
import electronIsDev from 'electron-is-dev';
import electronServe from 'electron-serve';
import windowStateKeeper from 'electron-window-state';
import { join } from 'path';
import { resolveDevServerUrl, buildCsp, isInternalNavigation } from './dev-server';
import { clampWindowBounds } from './window-bounds';

// Define components for a watcher to detect when the webapp is changed so we can reload in Dev mode.
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
};
export function setupReloadWatcher(electronCapacitorApp: ElectronCapacitorApp): void {
  reloadWatcher.watcher = chokidar
    .watch(join(app.getAppPath(), 'app'), {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          electronCapacitorApp.getMainWindow().webContents.reload();
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher(electronCapacitorApp);
        }, 1500);
      }
    });
}

// Define our class to manage our app.
export class ElectronCapacitorApp {
  private MainWindow: BrowserWindow | null = null;
  private SplashScreen: CapacitorSplashScreen | null = null;
  private TrayIcon: Tray | null = null;
  private CapacitorFileConfig: CapacitorElectronConfig;
  private TrayMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    new MenuItem({ label: 'Quit App', role: 'quit' }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    { role: 'viewMenu' },
  ];
  private mainWindowState;
  private loadWebApp;
  private customScheme: string;
  /** Non-null in development → load the vite dev server (live HMR) instead of
   *  the bundled static app. Null in production. */
  private devServerUrl: string | null = null;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme = this.CapacitorFileConfig.electron?.customUrlScheme ?? 'capacitor-electron';
    this.devServerUrl = resolveDevServerUrl(electronIsDev);

    if (trayMenuTemplate) {
      this.TrayMenuTemplate = trayMenuTemplate;
    }

    if (appMenuBarMenuTemplate) {
      this.AppMenuBarMenuTemplate = appMenuBarMenuTemplate;
    }

    // Setup our web app loader, this lets us load apps like react, vue, and angular without changing their build chains.
    this.loadWebApp = electronServe({
      directory: join(app.getAppPath(), 'app'),
      scheme: this.customScheme,
    });
  }

  // Helper function to load in the app. In dev, load the running vite dev
  // server (live content + HMR); in prod, electron-serve the bundled app.
  private async loadMainWindow(thisRef: any) {
    if (thisRef.devServerUrl) {
      await thisRef.loadDevServerWithRetry(thisRef.MainWindow, thisRef.devServerUrl);
    } else {
      await thisRef.loadWebApp(thisRef.MainWindow);
    }
  }

  // Dev: load the vite dev server, retrying until it's up. Electron can start
  // before vite has bound :5173; without retry the first load hits a closed
  // port and the window shows a blank page that never recovers (dom-ready
  // never fires → window stays hidden).
  //
  // We use loadURL ITSELF as the readiness probe: it rejects with a network
  // error (ERR_CONNECTION_REFUSED) while vite isn't listening, and resolves
  // once vite answers (even on a redirect/4xx). An earlier version pre-probed
  // with fetch(HEAD), but SvelteKit's dev server doesn't answer HEAD cleanly
  // so that fetch hung indefinitely and loadURL was never reached.
  private async loadDevServerWithRetry(win: BrowserWindow, url: string): Promise<void> {
    const deadlineMs = Date.now() + 30_000;
    while (Date.now() < deadlineMs) {
      try {
        await win.loadURL(url);
        return;
      } catch {
        /* vite not listening yet -- retry */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.error(`[electron] dev server ${url} did not become available within 30s`);
    // Don't strand a hidden window: reveal it so the user sees something
    // (even an error page) rather than an invisible process in the Dock.
    this.revealMainWindow();
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow {
    return this.MainWindow;
  }

  getCustomURLScheme(): string {
    return this.customScheme;
  }

  async init(): Promise<void> {
    // Branded icon: `build/icon.{png,ico}` is regenerated from
    // branding/brand.json by apply-brand. The old `assets/appIcon.*` is
    // the stale upstream Capacitor default and must NOT be used.
    const icon = nativeImage.createFromPath(
      join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Drop the saved x/y if it lands off every connected display (laptop
    // undocked / external monitor asleep) -- otherwise the window opens
    // off-screen and looks like "no window". `undefined` x/y centers it.
    const safe = clampWindowBounds(
      {
        x: this.mainWindowState.x,
        y: this.mainWindowState.y,
        width: this.mainWindowState.width,
        height: this.mainWindowState.height,
      },
      screen.getAllDisplays().map((d) => d.workArea),
    );
    // Setup preload script path and construct our main window.
    const preloadPath = join(app.getAppPath(), 'build', 'src', 'preload.js');
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      x: safe.x,
      y: safe.y,
      width: safe.width,
      height: safe.height,
      webPreferences: {
        // The renderer is the SvelteKit web app -- it must NOT have direct
        // Node access. Everything it needs (Capacitor plugin IPC + our
        // namespaced event bridge) is exposed through the contextBridge in
        // preload.ts + rt/electron-rt.ts, so nodeIntegration stays OFF and
        // contextIsolation ON (Electron security baseline).
        nodeIntegration: false,
        contextIsolation: true,
        // sandbox stays false (deliberate). The renderer is already locked down
        // by contextIsolation:true + nodeIntegration:false above (web content
        // can't touch Node). Enabling the preload sandbox isn't a simple bundle:
        // Capacitor's rt/electron-rt.ts uses Node `crypto.randomBytes` +
        // `events.EventEmitter`, which a sandboxed preload cannot provide, so
        // sandbox:true would break the Capacitor IPC bridge. Making it
        // sandbox-safe means rewriting that framework runtime (Web Crypto + an
        // EventEmitter shim) + full IPC retest -- tracked as separate hardening,
        // not done here. @capacitor-community/electron ships sandbox:false too.
        sandbox: false,
        preload: preloadPath,
      },
    });
    this.mainWindowState.manage(this.MainWindow);

    if (this.CapacitorFileConfig.backgroundColor) {
      this.MainWindow.setBackgroundColor(this.CapacitorFileConfig.electron.backgroundColor);
    }

    // If we close the main window with the splashscreen enabled we need to destory the ref.
    this.MainWindow.on('closed', () => {
      if (
        this.SplashScreen?.getSplashWindow() &&
        !this.SplashScreen.getSplashWindow().isDestroyed()
      ) {
        this.SplashScreen.getSplashWindow().close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon.on('double-click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.on('click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.setToolTip(app.getName());
      this.TrayIcon.setContextMenu(Menu.buildFromTemplate(this.TrayMenuTemplate));
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.AppMenuBarMenuTemplate));

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          'assets',
          this.CapacitorFileConfig.electron?.splashScreenImageName ?? 'splash.png',
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init(this.loadMainWindow, this);
    } else {
      this.loadMainWindow(this);
    }

    // Security
    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      return isInternalNavigation(details.url, this.customScheme, this.devServerUrl)
        ? { action: 'allow' }
        : { action: 'deny' };
    });
    this.MainWindow.webContents.on('will-navigate', (event, newURL) => {
      // Allow navigation only within the app (custom scheme, or the vite dev
      // server in development). External links are blocked here and handled by
      // the Browser plugin / system browser instead.
      if (!isInternalNavigation(newURL, this.customScheme, this.devServerUrl)) {
        event.preventDefault();
      }
    });

    // Link electron plugins into the system.
    setupCapacitorElectronPlugins();

    // Reveal the window the moment the renderer paints its first frame
    // (ready-to-show) AND when the DOM is ready -- whichever fires first;
    // revealMainWindow() is idempotent. The window is created with
    // `show: false`, so if NEITHER ever fires (dev server never answers,
    // a hard load failure) the window would stay invisible forever -- a
    // hidden process in the Dock. The fallback timer below guarantees we
    // show it regardless, and loadDevServerWithRetry reveals on its
    // deadline too.
    this.MainWindow.once('ready-to-show', () => this.revealMainWindow());
    this.MainWindow.webContents.on('dom-ready', () => this.revealMainWindow());
    this.windowRevealTimer = setTimeout(() => this.revealMainWindow(), 20_000);
  }

  /** Show + focus the main window exactly once, hiding the splash. Called
   *  from ready-to-show, dom-ready, the dev-load-failure path, and a
   *  fallback timer, so it MUST be idempotent. Respects
   *  hideMainWindowOnLaunch (launch-to-tray) by skipping the show. */
  private windowRevealTimer: ReturnType<typeof setTimeout> | null = null;
  private mainWindowRevealed = false;
  private revealMainWindow(): void {
    if (this.windowRevealTimer) {
      clearTimeout(this.windowRevealTimer);
      this.windowRevealTimer = null;
    }
    if (this.mainWindowRevealed) return;
    if (!this.MainWindow || this.MainWindow.isDestroyed()) return;
    this.mainWindowRevealed = true;

    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      const splash = this.SplashScreen?.getSplashWindow();
      if (splash && !splash.isDestroyed()) splash.hide();
    }
    if (!this.CapacitorFileConfig.electron?.hideMainWindowOnLaunch) {
      this.MainWindow.show();
      this.MainWindow.focus();
    }
    setTimeout(() => {
      if (electronIsDev && this.MainWindow && !this.MainWindow.isDestroyed()) {
        this.MainWindow.webContents.openDevTools();
      }
      CapElectronEventEmitter.emit('CAPELECTRON_DeeplinkListenerInitialized', '');
    }, 400);
  }
}

// Set a CSP up for our application based on the custom scheme
export function setupContentSecurityPolicy(customScheme: string): void {
  // Pass the resolved dev-server URL so the CSP allows a non-localhost
  // ELECTRON_DEV_SERVER_URL / CAPACITOR_SERVER_URL override (else it'd be blocked).
  const devServerUrl = resolveDevServerUrl(electronIsDev);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildCsp(customScheme, electronIsDev, devServerUrl)],
      },
    });
  });
}
