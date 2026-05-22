/** System tray / macOS Menu Bar. Context menu carries live stats
 *  (queued / applied / upcoming), section deep-links, scan/autopilot
 *  controls, window actions, macOS Menu-Bar-Only toggle. macOS title
 *  + Dock badge mirror the queued / upcoming counts; polls /api/stats
 *  every 30s with "(backend offline)" fallback. */
import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { BRAND } from './brand';
import { fetchStats, postEmpty, type Stats } from './tray-http';
import { buildTrayMenuTemplate, computeTrayTitle, computeDockBadge } from './tray-menu-builder';

export type TrayHandlers = {
  getBackendUrl: () => string;
  onOpen: () => void;
  onQuit: () => void;
  /** Bring the main window to front and navigate to a path. */
  onOpenPath?: (path: string) => void;
  /** Toggle Dock icon visibility (macOS). When `hideDock` is true the
   *  app becomes a pure menu-bar utility. */
  onSetDockVisible?: (visible: boolean) => void;
};

const POLL_INTERVAL_MS = 30_000;

/**
 * Electron tray menu controller. Class name is brand-agnostic
 * (DesktopTray, not HeronTray) so a rebrand doesn't require an
 * Xcode-style class rename across every importer.
 */
export class DesktopTray {
  private tray?: Tray;
  private timer?: NodeJS.Timeout;
  private stats: Stats | null = null;
  private handlers: TrayHandlers;
  private menuBarOnly = false;

  constructor(handlers: TrayHandlers) {
    this.handlers = handlers;
    // Restore the user's "Menu Bar Only" preference. Stored in a file so
    // it survives across launches; we don't pull in electron-store for one
    // boolean.
    try {
      const pref = path.join(app.getPath('userData'), 'menubar-only.pref');
      this.menuBarOnly = existsSync(pref);
    } catch {
      /* default: false */
    }
  }

  start(): void {
    const iconPath = path.resolve(__dirname, '..', '..', 'build', 'icon.png');
    const img = nativeImage.createFromPath(iconPath);
    // 22px is the macOS menu-bar standard. Windows tray icons render at
    // 16px but accept anything; the OS scales.
    const resized = img.resize({ width: 22, height: 22 });
    if (process.platform === 'darwin') resized.setTemplateImage(true);
    this.tray = new Tray(resized);
    this.tray.setToolTip(BRAND.displayName);
    // Single-click on the tray icon brings the window forward on
    // Windows + Linux. macOS opens the menu via the right-click handler.
    this.tray.on('click', () => {
      if (process.platform !== 'darwin') {
        this.handlers.onOpen();
      }
    });
    this.tray.on('right-click', () => this.tray?.popUpContextMenu());

    // Apply persisted menu-bar-only state.
    if (this.menuBarOnly) this.setMenuBarOnly(true);

    this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.tray?.destroy();
    this.tray = undefined;
  }

  /** Fetch /api/stats and rebuild the popover menu.
   *
   * F18 -- known multi-user limitation: this fetch runs from the Electron
   * main process which has NO Better-Auth cookie + NO bearer token (the
   * WebView holds those). On a multi-user install /api/stats 401s and
   * this returns null. The menu falls back to a generic
   * "Heron is running · open dashboard" state.
   *
   * Proper fix (follow-up): IPC bridge -- the WebView fetches stats
   * inside its authenticated context and pushes them to the main
   * process via `tray:push-stats`. The main process then doesn't need
   * to authenticate at all. Tracked as a Phase 4 follow-up.
   *
   * Until then: the tray gracefully degrades (no stats != crash).
   */
  private async refresh(): Promise<void> {
    const url = this.handlers.getBackendUrl();
    // fetchStats() is defensively try/catched -- it always resolves
    // (never rejects), returning null on failure. No outer .catch needed.
    this.stats = await fetchStats(url);
    this.rebuildMenu();
    this.updateDockBadge();
  }

  private rebuildMenu(): void {
    if (!this.tray) return;
    const items = buildTrayMenuTemplate(
      {
        stats: this.stats,
        platform: process.platform,
        menuBarOnly: this.menuBarOnly,
        appVersion: app.getVersion(),
        displayName: BRAND.displayName,
      },
      {
        onOpenPath: (p) => this.openPath(p),
        onShowDashboard: () => this.handlers.onOpen(),
        onHideWindow: () => {
          BrowserWindow.getAllWindows().forEach((w) => w.hide());
        },
        onRunTask: (taskId) => void this.runTask(taskId),
        onToggleAutopilot: () => void this.toggleAutopilot(),
        onToggleMenuBarOnly: () => this.setMenuBarOnly(!this.menuBarOnly),
        onQuit: () => this.handlers.onQuit(),
      },
    );

    const contextMenu = Menu.buildFromTemplate(items);
    this.tray.setContextMenu(contextMenu);

    // macOS title -- show queued count as a number badge next to the
    // tray icon when > 0. This is the equivalent of an unread badge for
    // a menu bar app.
    this.tray.setTitle(computeTrayTitle(this.stats, process.platform));
  }

  /** macOS / Linux Dock badge -- set to the upcoming-interviews count so
   *  glancing at the Dock shows "you have N interviews coming up". */
  private updateDockBadge(): void {
    if (process.platform !== 'darwin') return;
    if (!app.dock) return;
    app.dock.setBadge(computeDockBadge(this.stats, process.platform));
  }

  private openPath(p: string): void {
    if (this.handlers.onOpenPath) {
      this.handlers.onOpenPath(p);
    } else {
      this.handlers.onOpen();
    }
  }

  /** Toggle macOS Dock visibility. When hidden, Heron becomes a
   *  pure menu bar app -- close-window doesn't quit, the icon never
   *  appears in the Dock, and Cmd+Tab skips it. Re-show by re-toggling
   *  from the tray menu. */
  private setMenuBarOnly(enable: boolean): void {
    if (process.platform !== 'darwin' || !app.dock) return;
    this.menuBarOnly = enable;
    try {
      if (enable) {
        void app.dock.hide();
      } else {
        void app.dock.show();
      }
      this.handlers.onSetDockVisible?.(!enable);
      // Persist the preference.
      const pref = path.join(app.getPath('userData'), 'menubar-only.pref');
      if (enable) writeFileSync(pref, '1');
      else rmSync(pref, { force: true });
    } catch {
      /* non-fatal */
    }
    this.rebuildMenu();
  }

  private runTask(taskId: string): Promise<void> {
    return postEmpty(this.handlers.getBackendUrl(), '/api/jobs/' + taskId + '/run');
  }

  private toggleAutopilot(): Promise<void> {
    return postEmpty(this.handlers.getBackendUrl(), '/api/autopilot/toggle').then(() =>
      this.refresh(),
    );
  }
}
