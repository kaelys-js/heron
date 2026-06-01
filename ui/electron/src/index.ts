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
  nativeTheme,
  Notification,
  dialog,
  shell,
  ipcMain,
  net,
  crashReporter,
  powerMonitor,
} from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { watch } from 'node:fs';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { resolveDevServerUrl } from './dev-server';
import { installWebContentsGuard } from './web-contents-guard';
import { installPermissionHandlers } from './permissions';
import { assertSender } from './ipc-sender';
import { buildAppMenu } from './app-menu';
import { openAboutWindow, readLogoDataUri } from './about-window';
import { openChangelogWindow, renderReleaseNotes } from './changelog-window';
import type { ReleaseNotes } from './changelog-window';
import {
  readUpdatePrefs,
  writeUpdatePrefs,
  shouldShowForVersion,
  withShown,
  withSkipped,
  withChannel,
  resolveChannel,
  updaterFlagsForChannel,
} from './update-prefs';
import type { UpdateChannel, UpdatePrefs } from './update-prefs';
import { execSync } from 'node:child_process';
import { wireCrashRecovery } from './crash-recovery';
import { DesktopTray } from './tray';
import { startMdnsAdvertise } from './mdns';
import { BRAND } from './brand';
import { startEmbeddedServer, stopEmbeddedServer } from './server-process';
import type { ServerHandle } from './server-process';
import { resolveDeepLink } from './deep-links';
import { buildUnhandledErrorHandler, buildUnhandledRejectionHandler } from './error-routing';
import { startNetPoller } from './net-polling';
import { mainLog, pruneCrashDumps, logBackendStderr } from './log-sink';

/** State held by the main process. */
type AppState = {
  server?: ServerHandle;
  tray?: DesktopTray;
  mainWindow?: BrowserWindow;
  stopNetPoller?: () => void;
};
const state: AppState = {};

/** Build-time facts (commit / date / channel / current-version release notes).
 *  src/build-info.ts is GITIGNORED and regenerated only by the make/pack scripts
 *  (which prepend `node ../../scripts/native/gen-build-info.mjs`), so dev
 *  `electron:start` and unit tests run WITHOUT it. Resolve it via a guarded
 *  require with a literal fallback so its absence never breaks boot. */
type BuildInfo = { commit: string; buildDate: string; channel: string; releaseNotes: string };
const BUILD_INFO: BuildInfo = (() => {
  try {
    // CJS require (index.js is CommonJS) -- a static `import` would fail to
    // compile when build-info.ts is absent (gitignored; dev/tests run without it).
    return (require('./build-info') as { BUILD_INFO: BuildInfo }).BUILD_INFO;
  } catch {
    return {
      commit: 'dev',
      buildDate: '',
      channel: app.isPackaged ? 'stable' : 'dev',
      releaseNotes: '',
    };
  }
})();

/** Short git SHA from the working tree, or undefined off a non-git checkout.
 *  A dev `electron:start` doesn't regenerate build-info.ts, so this recovers a
 *  real commit for the About window instead of the literal 'dev'. Guarded like
 *  vite.config.ts's APP_BUILD. */
function safeGitShortSha(): string | undefined {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: app.getAppPath(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

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

// Local-only crash reporting. submitURL '' + uploadToServer false means
// Crashpad writes minidumps to the local crashes dir for `app.getPath('crashDumps')`
// / a future opt-in upload, and NOTHING leaves the machine -- no telemetry
// endpoint (consistent with the local-first posture). Must start before
// app.whenReady() so the handler is installed for early crashes.
crashReporter.start({ submitURL: '', uploadToServer: false });

const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);

// Sender context for IPC + navigation policy. The renderer loads from the
// custom scheme (prod) or the dev-server origin (dev); both are the only
// trusted origins for ipcMain messages / window-open / navigation.
const customScheme = myCapacitorApp.getCustomURLScheme();
const devServerUrl = resolveDevServerUrl(electronIsDev);
const senderCtx = { customScheme, devServerUrl };

// Install the process-wide webContents guard BEFORE any window is created, so
// EVERY webContents (main window, About/Changelog children, any popup a
// compromised renderer tries to open) inherits the navigation/window-open/
// webview policy -- not just the main window's per-instance handlers.
installWebContentsGuard({ customScheme, devServerUrl });

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

/** Clear the renderer's native session: HTTP cache + the web-storage backends
 *  (localStorage / IndexedDB / cookies / Cache API / service workers). Cookies
 *  included so this matches the renderer's full sign-out (reset.ts). Does NOT
 *  reload -- the caller decides whether to reload (the renderer IPC path lets the
 *  renderer drive its own location.replace; the menu path reloads in main). */
async function clearSessionCache(win: BrowserWindow | undefined): Promise<void> {
  if (!win || win.isDestroyed()) {
    return;
  }
  const { session } = win.webContents;
  await session.clearCache();
  await session.clearStorageData({
    storages: ['localstorage', 'indexdb', 'cookies', 'cachestorage', 'serviceworkers'],
  });
}

// ipcMain bridge -- preload calls these to interact with the main process.
// Every handler validates the sender frame is an internal (app/dev) origin
// before acting, so a cross-origin frame or a navigated-away renderer can't
// drive the main process. assertSender returns false (and logs) on a bad sender.
ipcMain.handle(`${BRAND.name}:get-server-url`, (e) =>
  assertSender(e, senderCtx) ? state.server?.url : undefined,
);
ipcMain.handle(`${BRAND.name}:show-notification`, (e, opts: { title: string; body: string }) => {
  if (!assertSender(e, senderCtx)) {
    return false;
  }
  if (Notification.isSupported()) {
    const n = new Notification({ title: opts.title, body: opts.body });
    n.show();
    return true;
  }
  return false;
});
// Renderer-triggered cache clear (window.electronAPI.clearCache, via reset.ts).
// Clears only -- the renderer drives the reload to /login itself.
ipcMain.handle(`${BRAND.name}:clear-cache`, (e) =>
  assertSender(e, senderCtx) ? clearSessionCache(state.mainWindow) : undefined,
);
// Renderer sets the Dock/taskbar unread badge count (e.g. unread recruiter
// emails / pending inbox URLs). app.setBadgeCount no-ops on platforms that
// don't support it. Non-finite/negative input is clamped to 0 (clear).
ipcMain.handle(`${BRAND.name}:set-badge`, (e, count: unknown) => {
  if (!assertSender(e, senderCtx)) {
    return false;
  }
  const n =
    typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return app.setBadgeCount(n);
});

/** (Re)apply the brand Dock icon + name on macOS. The Dock tile is reset to the
 *  bundle defaults (in dev: the Electron icon + "Electron") whenever the Dock is
 *  HIDDEN then SHOWN again, so we call this both at startup AND after un-hiding.
 *  Uses build/dock.png -- it carries the SAME Apple-grid inset as the .icns
 *  (824/1024 card), so the tile matches stock apps instead of rendering
 *  full-bleed/oversized, and a PNG is reliable in dev where nativeImage can't
 *  parse the .icns (which previously fell back to the full-bleed icon.png). */
function applyDockIdentity(): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }
  app.setName(BRAND.displayName);
  try {
    const dockIcon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'dock.png'));
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  } catch {
    /* non-fatal -- Dock keeps the default icon */
  }
}

(async () => {
  await app.whenReady();

  // Deny-by-default permission policy on the default session (mic +
  // notifications only, from internal origins; everything else + all device
  // pickers refused). Must run after whenReady so session.defaultSession exists.
  installPermissionHandlers(senderCtx);

  applyDockIdentity();
  // Dev-only HMR: re-apply when the brand-watcher regenerates dock.png, so a
  // brand edit shows live without restarting Electron (vite HMR only reloads
  // the WebView). Watch the dir -- survives generate-icons' atomic replace.
  if (process.platform === 'darwin' && app.dock && electronIsDev) {
    try {
      watch(path.join(app.getAppPath(), 'build'), (_event, file) => {
        if (file === 'dock.png') {
          applyDockIdentity();
        }
      });
    } catch {
      /* dev convenience; ignore */
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

  // Prune stale crash minidumps. crashReporter.start writes to
  // app.getPath('crashDumps') and Crashpad never prunes its own dir, so a
  // long-lived install accumulates minidumps forever. Best-effort + guarded
  // so it never blocks boot; runs after whenReady so the path resolves.
  pruneCrashDumps();

  // 1. Embedded server
  try {
    if (!electronIsDev) {
      const entry = path.join(__dirname, '..', '..', 'app', 'server', 'index.js');
      const handle = await startEmbeddedServer({
        entryPath: entry,
        // Capture the embedded server's stderr into the main log sink (with a
        // [backend] prefix) instead of losing it to stdio:'inherit' in a
        // packaged build where there's no terminal.
        onStderrLine: (line) => logBackendStderr(line, { isDev: electronIsDev }),
      });
      if (handle) {
        state.server = handle;
        // Surface non-zero exits to the user.
        handle.process.on('exit', (code) => {
          mainLog('warn', `[main] embedded server exited with code ${code}`);
          state.server = undefined;
          if (code !== 0 && state.mainWindow && !state.mainWindow.isDestroyed()) {
            dialog.showErrorBox(
              `${BRAND.displayName} backend stopped`,
              `The embedded server exited unexpectedly (code ${code}). Restart the app.`,
            );
          }
        });
      } else {
        mainLog('warn', '[main] embedded server entry not found -- falling back to resolver');
      }
    }
  } catch (e) {
    mainLog(
      'error',
      `[main] failed to start embedded server ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
    );
    // Don't bail -- the WebView's resolver may still find a remote backend.
  }

  // 2. mDNS advertise (only if we have an embedded server). Fire and
  // forget -- startMdnsAdvertise handles its own try/catch internally.
  if (state.server?.port) {
    startMdnsAdvertise({ name: BRAND.name, port: state.server.port }).catch((e) => {
      mainLog('warn', `[main] mDNS advertise failed ${e instanceof Error ? e.message : String(e)}`);
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

  // ── Update preferences (channel + nag-control) ───────────────────
  // Persisted in app.getPath('userData')/update-prefs.json. `channel` flips the
  // updater into the GitHub prerelease feed; lastShownVersion + skippedVersions
  // stop the styled changelog window re-popping for a version the user already
  // saw / skipped (auto-download re-fires update-downloaded on every launch).
  const updatePrefsPath = path.join(app.getPath('userData'), 'update-prefs.json');
  let updatePrefs: UpdatePrefs = readUpdatePrefs(updatePrefsPath);
  const persistUpdatePrefs = (next: UpdatePrefs): void => {
    updatePrefs = next;
    writeUpdatePrefs(updatePrefsPath, next);
  };

  // Apply the saved channel to the updater. Beta = the GitHub PRERELEASE feed via
  // allowPrerelease -- NOT autoUpdater.channel='beta'. electron-builder emits only
  // a single latest.yml for the github provider, so a beta channel file never
  // exists; the beta/stable split is the prerelease flag. updaterFlagsForChannel
  // (update-prefs.ts) owns that mapping + the why, and is unit-tested so the
  // channel='beta' regression can't return.
  const applyUpdateChannel = (channel: UpdateChannel): void => {
    const flags = updaterFlagsForChannel(channel);
    autoUpdater.channel = flags.channel;
    autoUpdater.allowPrerelease = flags.allowPrerelease;
    autoUpdater.allowDowngrade = flags.allowDowngrade;
  };
  applyUpdateChannel(updatePrefs.channel);

  // Switch channel: persist, re-apply the updater config, rebuild the menu so the
  // Help radio reflects it, and kick a fresh check so a beta opt-in surfaces a
  // pending prerelease without a relaunch. Shared by the Settings-UI IPC + the
  // Help-menu radio. rebuildAppMenu is hoisted (assigned in section 4) -- this is
  // only ever invoked on a user action, long after boot wires it.
  const changeUpdateChannel = (channel: UpdateChannel): void => {
    persistUpdatePrefs(withChannel(updatePrefs, channel));
    applyUpdateChannel(channel);
    rebuildAppMenu();
    if (app.isPackaged || devUpdateForced) {
      autoUpdater.checkForUpdates().catch(() => {
        /* a re-check failure here is non-fatal -- the boot check / next manual
           check will retry; an error dialog on a silent channel switch is noise */
      });
    }
  };

  // Dev-test harness. A packaged build reads dev-app-update.yml is never used;
  // but in dev (`electron:start`) checkForUpdates early-returns. Setting
  // HERON_DEV_UPDATE points the updater at the committed sample config so the
  // real check + event flow can be exercised against GitHub Releases without a
  // full packaged build. Without the flag we keep the "development build" dialog.
  const devUpdateForced = !app.isPackaged && !!process.env.HERON_DEV_UPDATE;
  if (devUpdateForced) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.updateConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml');
  }

  // Manual "Check for Updates…" controller. The silent boot check
  // (checkForUpdatesAndNotify, below) shows nothing when already current; a
  // user-initiated check MUST give feedback either way. `manualUpdateCheck`
  // gates the shared autoUpdater listeners (wired once, below) so the manual
  // flow surfaces not-available / error dialogs. In an unpackaged/dev build
  // electron-updater can't really check (unless HERON_DEV_UPDATE forces the dev
  // config), so we say so instead of emitting a confusing error.
  let manualUpdateCheck = false;
  const showUpdateDialog = (opts: Electron.MessageBoxOptions) =>
    state.mainWindow ? dialog.showMessageBox(state.mainWindow, opts) : dialog.showMessageBox(opts);

  // Open the styled changelog window for an update event. mode 'available' wires
  // Download; 'downloaded' wires Restart & Update + a "Skip this version"
  // affordance (persists the skip). Nag-control records the shown version so the
  // same release doesn't re-pop on the next launch.
  const openUpdateChangelog = (
    mode: 'available' | 'downloaded',
    version: string,
    notes: ReleaseNotes,
  ): void => {
    persistUpdatePrefs(withShown(updatePrefs, version));
    openChangelogWindow({
      brandName: BRAND.name,
      preloadPath: path.join(app.getAppPath(), 'build', 'src', 'changelog-preload.js'),
      parent: state.mainWindow,
      appPath: app.getAppPath(),
      onDownload: () => autoUpdater.downloadUpdate(),
      onInstall: () => autoUpdater.quitAndInstall(),
      onSkip: () => persistUpdatePrefs(withSkipped(updatePrefs, version)),
      info: {
        displayName: BRAND.displayName,
        version,
        mode,
        notesHtml: renderReleaseNotes(notes),
        colors: BRAND.colors,
        logoDataUri: readLogoDataUri(app.getAppPath()),
        closeOnLeft: process.platform === 'darwin',
        showSkip: mode === 'downloaded',
      },
    });
  };

  const triggerManualUpdateCheck = (): void => {
    if (!app.isPackaged && !devUpdateForced) {
      void showUpdateDialog({
        type: 'info',
        title: BRAND.displayName,
        message: 'Updates are available in the installed app.',
        detail: `You're on a development build (${app.getVersion()}); auto-update only runs in the packaged release.`,
        buttons: ['OK'],
      });
      return;
    }
    manualUpdateCheck = true;
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      manualUpdateCheck = false;
      void showUpdateDialog({
        type: 'error',
        title: BRAND.displayName,
        message: 'Update check failed.',
        detail: err instanceof Error ? err.message : String(err),
        buttons: ['OK'],
      });
    });
  };

  // IPC: the Settings UI + Help-menu radio read / write the release channel.
  // Setting it persists, re-applies the updater config, and kicks a fresh check
  // so a beta opt-in surfaces a pending prerelease without a relaunch.
  ipcMain.handle(`${BRAND.name}:get-update-channel`, (e) =>
    assertSender(e, senderCtx) ? updatePrefs.channel : undefined,
  );
  ipcMain.handle(`${BRAND.name}:set-update-channel`, (e, value: unknown) => {
    if (!assertSender(e, senderCtx)) {
      return false;
    }
    changeUpdateChannel(resolveChannel(value));
    return true;
  });

  // Dev-only "Simulate update…" (View menu, isDev-gated). Opens the styled
  // changelog window with a fake downloaded update so the UX can be inspected
  // without a real release. Restart & Update just closes (no real
  // quitAndInstall in dev).
  const onSimulateUpdate = (): void => {
    openChangelogWindow({
      brandName: BRAND.name,
      preloadPath: path.join(app.getAppPath(), 'build', 'src', 'changelog-preload.js'),
      parent: state.mainWindow,
      appPath: app.getAppPath(),
      onInstall: () => {
        console.log('[update] (dev) simulate: Restart & Update clicked -- no-op in dev');
      },
      onSkip: () => {
        console.log('[update] (dev) simulate: Skip this version clicked -- no-op in dev');
      },
      info: {
        displayName: BRAND.displayName,
        version: '99.0.0-dev',
        mode: 'downloaded',
        notesHtml: renderReleaseNotes(
          '### What’s New\n- A **simulated** update card for previewing the release UX.\n- `Restart & Update` and `Skip this version` are no-ops in dev.\n\nSee https://heron.app/changelog for the real notes.',
        ),
        colors: BRAND.colors,
        logoDataUri: readLogoDataUri(app.getAppPath()),
        closeOnLeft: process.platform === 'darwin',
        showSkip: true,
      },
    });
  };

  // 4. Full app menu. Rebuilt on navigation so the File menu surfaces the auth
  //    actions only while the renderer is on /login or /signup.
  const menuHandlers = {
    onPreferences: () =>
      state.mainWindow?.webContents.loadURL(
        `${state.server?.url ?? 'http://localhost:5173'}/settings`,
      ),
    onAbout: () => {
      const commit = BUILD_INFO.commit || safeGitShortSha() || 'dev';
      // Build-origin stamp (how the binary was cut). Every production build is
      // promoted from a beta cut WITHOUT a rebuild, so this reads 'beta' even on the
      // stable channel -- it stays a "Built as" copy diagnostic, not the headline.
      const buildChannel = BUILD_INFO.channel || (app.isPackaged ? 'stable' : 'dev');
      // The headline channel = what the user actually receives: their runtime
      // update-channel pref. A promoted-to-stable user reads 'stable', not the
      // 'beta' build origin. Dev isn't a real update feed, so show 'dev' there.
      const channel = app.isPackaged ? updatePrefs.channel : 'dev';
      const { releaseNotes } = BUILD_INFO;
      openAboutWindow({
        brandName: BRAND.name,
        preloadPath: path.join(app.getAppPath(), 'build', 'src', 'about-preload.js'),
        parent: state.mainWindow,
        appPath: app.getAppPath(),
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
          commit,
          buildDate: BUILD_INFO.buildDate,
          channel,
          buildChannel,
          platformArch: `${process.platform}/${process.arch}`,
          releaseNotes,
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
          closeOnLeft: process.platform === 'darwin',
        },
        // "What's New" opens the changelog card in 'current' mode with THIS
        // version's CHANGELOG section (sanitised by renderReleaseNotes).
        onWhatsNew: () => {
          openChangelogWindow({
            brandName: BRAND.name,
            preloadPath: path.join(app.getAppPath(), 'build', 'src', 'changelog-preload.js'),
            parent: state.mainWindow,
            appPath: app.getAppPath(),
            info: {
              displayName: BRAND.displayName,
              version: app.getVersion(),
              mode: 'current',
              notesHtml: renderReleaseNotes(releaseNotes),
              colors: BRAND.colors,
              logoDataUri: readLogoDataUri(app.getAppPath()),
              closeOnLeft: process.platform === 'darwin',
            },
          });
        },
      });
    },
    // Documentation → the actual docs/ tree (distinct from "View on GitHub",
    // which opens the repo root). The repo's docs/ folder is the real handbook.
    onOpenDocs: () => shell.openExternal(`${BRAND.repoUrl}/tree/main/docs`),
    onCheckForUpdates: triggerManualUpdateCheck,
    // View → "Clear Cache & Reload…". The menu path runs in main, so after the
    // confirm it can clear the session AND reload directly via myCapacitorApp
    // (re-running the load path -- NOT webContents.reload(), which would reload
    // the crash-recovery data: URL). Distinct from the renderer IPC clear, which
    // only clears and lets the renderer drive its own reload.
    onClearCache: () => {
      const win = state.mainWindow;
      const confirm = win
        ? dialog.showMessageBox(win, {
            type: 'warning',
            title: BRAND.displayName,
            message: 'Clear cache and reload?',
            detail:
              'This clears the local cache and signs you out of this device. Your data on the server is not affected.',
            buttons: ['Clear & Reload', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
          })
        : dialog.showMessageBox({
            type: 'warning',
            title: BRAND.displayName,
            message: 'Clear cache and reload?',
            detail:
              'This clears the local cache and signs you out of this device. Your data on the server is not affected.',
            buttons: ['Clear & Reload', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
          });
      void confirm.then(async (res) => {
        if (res.response !== 0) {
          return;
        }
        await clearSessionCache(state.mainWindow);
        void myCapacitorApp.reload();
      });
    },
    onReportBug: () => shell.openExternal(`${BRAND.issuesUrl}/new`),
    // Dev-only View → "Simulate update…" (isDev-gated like the reload items).
    onSimulateUpdate,
    // Help → "Release channel" radio. Shared logic with the Settings-UI IPC.
    onSetUpdateChannel: changeUpdateChannel,
    // Auth File-menu actions -> fire IPC the renderer handles (navigate / passkey).
    onGotoLogin: () => state.mainWindow?.webContents.send(`${BRAND.name}:menu:navigate`, '/login'),
    onGotoSignup: () =>
      state.mainWindow?.webContents.send(`${BRAND.name}:menu:navigate`, '/signup'),
    onPasskeySignin: () => state.mainWindow?.webContents.send(`${BRAND.name}:menu:passkey`),
  };
  const currentRoute = (): string => {
    try {
      return new URL(state.mainWindow?.webContents.getURL() ?? '').pathname;
    } catch {
      return '';
    }
  };
  const rebuildAppMenu = (): void =>
    Menu.setApplicationMenu(
      buildAppMenu(menuHandlers, {
        route: currentRoute(),
        isDev: electronIsDev,
        updateChannel: updatePrefs.channel,
      }),
    );
  rebuildAppMenu();
  if (state.mainWindow) {
    // SvelteKit client navigations use history.pushState -> did-navigate-in-page;
    // full page loads -> did-navigate. Rebuild on both so the File menu tracks
    // the current route.
    state.mainWindow.webContents.on('did-navigate', rebuildAppMenu);
    state.mainWindow.webContents.on('did-navigate-in-page', rebuildAppMenu);
  }

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
    onSetDockVisible: (visible: boolean) => {
      // Un-hiding the Dock recreates the tile from the bundle defaults
      // (Electron icon + name in dev), so re-apply the brand identity.
      if (visible) {
        applyDockIdentity();
      }
    },
    onQuit: () => app.quit(),
  });
  state.tray.start();

  // 6. Auto-update against GitHub Releases. autoDownload stays TRUE (default):
  //    a found update downloads in the background. The bare dialogs are replaced
  //    by the styled changelog window (TestFlight-style release card):
  //      - update-available: MANUAL flow only -> 'available' card (Download).
  //        (The auto/boot path doesn't pop here -- it's already downloading; the
  //        download-complete card is the surface for that path.)
  //      - update-downloaded: BOTH the auto AND manual paths -> 'downloaded' card
  //        (Restart & Update + Skip this version), gated by nag-control so the
  //        same version doesn't re-pop on every relaunch.
  //      - update-not-available + error: MANUAL flow only -> plain dialog.
  //    Listeners are wired ONCE; `manualUpdateCheck` gates the manual-only ones.
  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) {
      return;
    }
    manualUpdateCheck = false;
    void showUpdateDialog({
      type: 'info',
      title: BRAND.displayName,
      message: `You're up to date.`,
      detail: `${BRAND.displayName} ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    });
  });
  autoUpdater.on('update-available', (info: { version?: string; releaseNotes?: ReleaseNotes }) => {
    if (!manualUpdateCheck) {
      return;
    }
    // Leave manualUpdateCheck set so the manual flow's update-downloaded still
    // routes through (its own nag-control prevents a duplicate card).
    const version = info?.version ?? '';
    openUpdateChangelog('available', version, info?.releaseNotes ?? null);
  });
  autoUpdater.on('update-downloaded', (info: { version?: string; releaseNotes?: ReleaseNotes }) => {
    const wasManual = manualUpdateCheck;
    manualUpdateCheck = false;
    const version = info?.version ?? '';
    // Nag-control: don't re-surface the same version twice (auto-download
    // re-fires this on every launch until the user restarts) and never re-pop a
    // version the user skipped. A manual check always shows (the user asked).
    if (!wasManual && !shouldShowForVersion(updatePrefs, version)) {
      return;
    }
    openUpdateChangelog('downloaded', version, info?.releaseNotes ?? null);
  });
  autoUpdater.on('error', (err: unknown) => {
    if (!manualUpdateCheck) {
      return;
    }
    manualUpdateCheck = false;
    void showUpdateDialog({
      type: 'error',
      title: BRAND.displayName,
      message: 'Update check failed.',
      detail: err instanceof Error ? err.message : String(err),
      buttons: ['OK'],
    });
  });
  // checkForUpdatesAndNotify runs the boot check; wrap in .catch so a network
  // failure at startup doesn't surface an unhandled rejection. Route the
  // failure to the file sink (not just console) so an updater problem is
  // diagnosable post-mortem in a packaged build with no terminal.
  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    mainLog(
      'warn',
      `[update] boot check failed ${err instanceof Error ? err.message : String(err)}`,
    );
  });

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

  // 8. OS dark/light theme sync. nativeTheme fires 'updated' when the system
  // appearance changes; push it to the renderer so the SvelteKit theme can
  // follow the OS without a reload. The renderer listens for `<brand>:theme`.
  nativeTheme.on('updated', () => {
    try {
      state.mainWindow?.webContents.send(`${BRAND.name}:theme`, {
        dark: nativeTheme.shouldUseDarkColors,
      });
    } catch {
      /* swallow secondary errors */
    }
  });

  // 9. Power-state sync. Pause the net poller on suspend (no point probing
  // connectivity while asleep -- it wakes the radio + spams transitions on
  // resume) and resume it on wake. powerMonitor is only available after
  // whenReady, so it's wired here.
  powerMonitor.on('suspend', () => {
    state.stopNetPoller?.();
    state.stopNetPoller = undefined;
  });
  powerMonitor.on('resume', () => {
    if (!state.stopNetPoller) {
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
    }
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
