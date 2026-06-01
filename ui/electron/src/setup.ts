import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from '@capacitor-community/electron';
import chokidar from 'chokidar';
import type { MenuItemConstructorOptions } from 'electron';
import {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  nativeImage,
  screen,
  shell,
  Tray,
  session,
} from 'electron';
import electronIsDev from 'electron-is-dev';
import electronServe from 'electron-serve';
import windowStateKeeper from 'electron-window-state';
import { join } from 'path';
import {
  resolveDevServerUrl,
  buildCsp,
  isInternalNavigation,
  decideWindowOpen,
} from './dev-server';
import { clampWindowBounds } from './window-bounds';
import { buildWindowChrome } from './window-chrome';
import { resolveBackgroundColor } from './background-color';
import { buildSplashHtml } from './splash';
import { BRAND } from './brand';

/** Probe a dev-server URL: resolves true on ANY HTTP response (incl. a
 *  redirect or 4xx), false on connection-refused or a >800ms hang. Used to
 *  wait for vite to bind before navigating, so a failed load never replaces
 *  the splash with Chromium's error page. */
async function devServerReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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

  // Helper function to load in the app. We ALWAYS paint the branded splash
  // first (instant, before vite/the bundle is ready) so there's no long blank
  // wait -- the Electron analogue of the iOS launch screen. Then, in dev we
  // load the running vite dev server (live content + HMR); in prod we
  // electron-serve the bundled app, both OVER the splash.
  private async loadMainWindow(thisRef: any) {
    await thisRef.showSplash();
    // Hold for exactly the mascot bounce-in duration (splash-spec's
    // `splash-bounce` is 820ms) AFTER the splash paints, so the bounce plays in
    // full and we navigate the instant it settles -- no lingering "slow" feel,
    // and it matches the WebView boot-fallback's bounce speed. (A ready dev
    // server would otherwise load over the splash before the bounce shows.)
    const SPLASH_BOUNCE_MS = 820;
    await new Promise((resolve) => setTimeout(resolve, SPLASH_BOUNCE_MS));
    if (thisRef.devServerUrl) {
      await thisRef.loadDevServerWithRetry(thisRef.MainWindow, thisRef.devServerUrl);
    } else {
      await thisRef.loadWebApp(thisRef.MainWindow);
    }
  }

  // Paint the branded splash immediately. Loading it (a data: URL) fires
  // dom-ready within milliseconds, which reveals the window -- so the user
  // sees a branded loading screen at once instead of waiting for the dev
  // server / bundle to paint.
  private async showSplash(): Promise<void> {
    if (!this.MainWindow || this.MainWindow.isDestroyed()) {
      return;
    }
    const html = buildSplashHtml();
    await this.MainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(
      () => {},
    );
  }

  // Dev: wait for the vite dev server, THEN load it over the splash. We PROBE
  // for readiness (a GET that resolves on any response, aborted after 800ms)
  // instead of using loadURL as the probe -- a failed loadURL would replace the
  // splash with Chromium's error page, so we only navigate once vite answers.
  private async loadDevServerWithRetry(win: BrowserWindow, url: string): Promise<void> {
    const deadlineMs = Date.now() + 30_000;
    while (Date.now() < deadlineMs) {
      if (await devServerReachable(url)) {
        try {
          await win.loadURL(url);
          return;
        } catch {
          /* transient -- fall through and retry */
        }
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.error(`[electron] dev server ${url} did not become available within 30s`);
    // The splash is already revealed; leave it up rather than stranding a
    // hidden window. revealMainWindow is idempotent.
    this.revealMainWindow();
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow {
    return this.MainWindow;
  }

  /** Re-load the app into the existing main window. Re-runs the same
   *  dev-server-with-retry / electron-serve path used at startup -- used by
   *  crash recovery to bring a dead renderer back to the live app (calling
   *  webContents.reload() would instead reload the recovery data: URL). */
  async reload(): Promise<void> {
    if (this.MainWindow && !this.MainWindow.isDestroyed()) {
      await this.loadMainWindow(this);
    }
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
    // Per-OS modern chrome: macOS hiddenInset title bar + 'sidebar' vibrancy,
    // Win11 mica. When a material is active the window is built transparent so
    // it shows through the (translucent) sidebar/topbar; the renderer reserves a
    // matching top drag strip + traffic-light clearance (app.css `.is-electron`).
    const chrome = buildWindowChrome(process.platform);
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      x: safe.x,
      y: safe.y,
      width: safe.width,
      height: safe.height,
      titleBarStyle: chrome.titleBarStyle,
      trafficLightPosition: chrome.trafficLightPosition,
      vibrancy: chrome.vibrancy,
      backgroundMaterial: chrome.backgroundMaterial,
      // A floor so the responsive layout never collapses. Deliberately NO
      // maxWidth/maxHeight: a desktop window must be free to maximize / go
      // fullscreen to fill ANY display (4K / 5K / ultrawide are common in 2026),
      // and a max ceiling silently caps `maximize()` to a sub-screen rectangle
      // on large monitors -- which also defeats windowStateKeeper.manage()'s
      // restore of the saved maximized/fullscreen state (see manage() below).
      minWidth: 760,
      minHeight: 560,
      // Win/Linux: hide the native menu bar by default (Alt reveals it) -- the
      // app surfaces own their chrome. macOS keeps its always-on global menu bar.
      autoHideMenuBar: process.platform !== 'darwin',
      // Background, two modes:
      //  • Material chrome (mac vibrancy / win mica): build FULLY TRANSPARENT so
      //    the OS material shows through the translucent sidebar/topbar. The
      //    material itself is what paints during the pre-first-frame window (a
      //    soft frosted blur, never a dark flash), so it REPLACES the opaque
      //    anti-flash trick rather than fighting it.
      //  • No material (Linux / unsupported): keep the opaque splash tone
      //    (#3e4f5e) so the native bg matches the splash the window loads first
      //    (showSplash) and no dark frame flashes through during the nav to the
      //    app. Falls back to the Capacitor bg if splashBg somehow isn't set.
      // Set via the constructor (the idiomatic spot): a post-construct
      // setBackgroundColor(undefined) throws "conversion failure from undefined",
      // and that throw used to abort init() before the window was revealed.
      backgroundColor: chrome.transparentBackground
        ? '#00000000'
        : (BRAND.colors.splashBg ?? resolveBackgroundColor(this.CapacitorFileConfig)),
      webPreferences: {
        // The renderer is the SvelteKit web app -- it must NOT have direct
        // Node access. Everything it needs (Capacitor plugin IPC + our
        // namespaced event bridge) is exposed through the contextBridge in
        // preload.ts + rt/electron-rt.ts, so nodeIntegration stays OFF and
        // contextIsolation ON (Electron security baseline).
        nodeIntegration: false,
        contextIsolation: true,
        // Explicit (it's the default) so a future careless edit can't silently
        // disable it: keeps same-origin policy + blocks file:// fetches from the
        // renderer. Defense-in-depth alongside contextIsolation/nodeIntegration.
        webSecurity: true,
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

    // Pin the visual (pinch) zoom to 1x: a trackpad pinch would otherwise zoom
    // the whole web layout like a web page, which reads as broken in an app
    // window. The View menu's text zoom (Cmd/Ctrl +/-) is a separate level and
    // is unaffected. Fire-and-forget (returns a Promise; nothing awaits it).
    void this.MainWindow.webContents.setVisualZoomLevelLimits(1, 1);

    // Arm the window-reveal path IMMEDIATELY after construction -- before any
    // other setup that could throw. The window is created with `show: false`;
    // it's revealed on the renderer's first frame (ready-to-show) or DOM-ready,
    // whichever fires first (revealMainWindow is idempotent). If NEITHER ever
    // fires (dev server never answers, a hard load failure) OR a later line in
    // init() throws, the fallback timer still reveals the window so we never
    // strand an invisible process in the Dock. (A regression where init() threw
    // on setBackgroundColor left these unwired and the window hidden forever --
    // wiring them first makes the reveal independent of the rest of setup.)
    this.MainWindow.once('ready-to-show', () => this.revealMainWindow());
    this.MainWindow.webContents.on('dom-ready', () => this.revealMainWindow());
    this.windowRevealTimer = setTimeout(() => this.revealMainWindow(), 20_000);

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

    // Security. window.open() / target=_blank: internal URLs open in-app,
    // external http(s) open in the user's REAL browser (shell.openExternal),
    // and anything else (file:/javascript:/data:/foreign schemes) is denied --
    // a compromised renderer must not launch arbitrary protocol handlers.
    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      const decision = decideWindowOpen(details.url, this.customScheme, this.devServerUrl);
      if (decision === 'external') {
        void shell.openExternal(details.url);
      }
      return decision === 'allow' ? { action: 'allow' } : { action: 'deny' };
    });
    // Block top-level navigation OUT of the app on BOTH the user-initiated path
    // (will-navigate) AND the server-driven path (will-redirect -- a 30x to an
    // external origin bypasses will-navigate entirely). Internal nav is allowed;
    // external links reach the system browser via the window-open handler above.
    const blockExternalNav = (event: Electron.Event, newURL: string): void => {
      if (!isInternalNavigation(newURL, this.customScheme, this.devServerUrl)) {
        event.preventDefault();
      }
    };
    this.MainWindow.webContents.on('will-navigate', blockExternalNav);
    this.MainWindow.webContents.on('will-redirect', blockExternalNav);

    // Link electron plugins into the system. (Window reveal is already wired
    // above, so even if this throws the window still appears.)
    setupCapacitorElectronPlugins();
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
    if (this.mainWindowRevealed) {
      return;
    }
    if (!this.MainWindow || this.MainWindow.isDestroyed()) {
      return;
    }
    this.mainWindowRevealed = true;

    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      const splash = this.SplashScreen?.getSplashWindow();
      if (splash && !splash.isDestroyed()) {
        splash.hide();
      }
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
