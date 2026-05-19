/**
 * System tray / macOS Menu Bar — live job-application status at a glance.
 *
 * Renders a tray icon in macOS top-right / Windows bottom-right / Linux
 * as supported. Clicking the icon opens a context menu with:
 *
 *   • Live stats line (queued / applied today / upcoming interviews)
 *   • Per-section deep links (Pipeline, Inbox, Queue, Stats)
 *   • Run actions (Scan now, Pause/Resume autopilot)
 *   • Window controls (Show, Hide, Quit)
 *   • Menu Bar Only mode toggle (macOS) — hides the Dock icon and
 *     promotes Heron to a pure menu bar app
 *
 * Live updates:
 *   • macOS title shows the queued count when > 0 (e.g. "▶︎ 3")
 *   • Dock badge mirrors the upcoming-interviews count
 *   • Polls /api/stats every 30s; falls back to "(backend offline)"
 *     when unreachable.
 */
import { Tray, Menu, MenuItemConstructorOptions, nativeImage, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BRAND } from './brand';

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

type Stats = {
  queued: number;
  appliedToday: number;
  upcomingInterviews: number;
  openIssues?: number;
  autopilotPaused?: boolean;
};

const POLL_INTERVAL_MS = 30_000;
// Persisted user-preference key — INTENTIONALLY kept as a stable literal
// rather than brand-derived because changing the key on rebrand would
// silently lose every user's saved "Menu Bar Only" preference. If a
// future rebrand needs the key changed, ship a migration that reads
// the old key + writes the new one + deletes the old.
const PREF_HIDE_DOCK = 'careerOpsHideDock';

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
      const fs = require('node:fs') as typeof import('node:fs');
      const pref = path.join(app.getPath('userData'), 'menubar-only.pref');
      this.menuBarOnly = fs.existsSync(pref);
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
   * F18 — known multi-user limitation: this fetch runs from the Electron
   * main process which has NO Better-Auth cookie + NO bearer token (the
   * WebView holds those). On a multi-user install /api/stats 401s and
   * this returns null. The menu falls back to a generic
   * "Heron is running · open dashboard" state.
   *
   * Proper fix (follow-up): IPC bridge — the WebView fetches stats
   * inside its authenticated context and pushes them to the main
   * process via `tray:push-stats`. The main process then doesn't need
   * to authenticate at all. Tracked as a Phase 4 follow-up.
   *
   * Until then: the tray gracefully degrades (no stats != crash).
   */
  private async refresh(): Promise<void> {
    const url = this.handlers.getBackendUrl();
    this.stats = await this.fetchStats(url).catch(() => null);
    this.rebuildMenu();
    this.updateDockBadge();
  }

  private fetchStats(baseUrl: string): Promise<Stats | null> {
    return new Promise((resolve) => {
      try {
        const u = new URL('/api/stats', baseUrl);
        const isHttps = u.protocol === 'https:';
        const fn = isHttps ? httpsRequest : httpRequest;
        const req = fn(
          {
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname,
            timeout: 2000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              try {
                const body = Buffer.concat(chunks).toString('utf8');
                const parsed = JSON.parse(body) as Stats;
                resolve(parsed);
              } catch {
                resolve(null);
              }
            });
            res.on('error', () => resolve(null));
          },
        );
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  private rebuildMenu(): void {
    if (!this.tray) return;
    const items: MenuItemConstructorOptions[] = [];
    if (this.stats) {
      items.push({
        label: `Today: ${this.stats.queued} queued · ${this.stats.appliedToday} applied · ${this.stats.upcomingInterviews} interviews`,
        enabled: false,
      });
      if ((this.stats.openIssues ?? 0) > 0) {
        items.push({
          label: `⚠ ${this.stats.openIssues} open issue${this.stats.openIssues === 1 ? '' : 's'}`,
          click: () => this.openPath('/inbox'),
        });
      }
    } else {
      items.push({ label: '(backend offline)', enabled: false });
    }
    items.push({ type: 'separator' });

    // Per-section quick-jumps.
    items.push({
      label: 'Pipeline',
      accelerator: 'CmdOrCtrl+P',
      click: () => this.openPath('/pipeline'),
    });
    items.push({
      label: 'Inbox',
      accelerator: 'CmdOrCtrl+I',
      click: () => this.openPath('/inbox'),
    });
    items.push({
      label: 'Queue',
      click: () => this.openPath('/queue'),
    });
    items.push({
      label: 'Stats',
      click: () => this.openPath('/stats'),
    });
    items.push({ type: 'separator' });

    // Run actions.
    items.push({
      label: 'Scan now',
      click: () => void this.runTask('scan-portals'),
    });
    if (this.stats) {
      items.push({
        label: this.stats.autopilotPaused ? 'Resume autopilot' : 'Pause autopilot',
        click: () => void this.toggleAutopilot(),
      });
    }
    items.push({ type: 'separator' });

    // Window + Dock controls (macOS only).
    if (process.platform === 'darwin') {
      items.push({
        label: 'Menu Bar Only (hide Dock icon)',
        type: 'checkbox',
        checked: this.menuBarOnly,
        click: () => this.setMenuBarOnly(!this.menuBarOnly),
      });
      items.push({ type: 'separator' });
    }

    items.push({
      label: 'Show dashboard',
      accelerator: 'CmdOrCtrl+0',
      click: () => this.handlers.onOpen(),
    });
    items.push({
      label: 'Hide window',
      accelerator: 'CmdOrCtrl+H',
      click: () => {
        BrowserWindow.getAllWindows().forEach((w) => w.hide());
      },
    });
    items.push({ type: 'separator' });
    items.push({ label: `Version ${app.getVersion()}`, enabled: false });
    items.push({
      label: `Quit ${BRAND.displayName}`,
      accelerator: 'CmdOrCtrl+Q',
      click: () => this.handlers.onQuit(),
    });

    const contextMenu = Menu.buildFromTemplate(items);
    this.tray.setContextMenu(contextMenu);

    // macOS title — show queued count as a number badge next to the
    // tray icon when > 0. This is the equivalent of an unread badge for
    // a menu bar app.
    if (process.platform === 'darwin' && this.stats && this.stats.queued > 0) {
      this.tray.setTitle(String(this.stats.queued));
    } else if (process.platform === 'darwin') {
      this.tray.setTitle('');
    }
  }

  /** macOS / Linux Dock badge — set to the upcoming-interviews count so
   *  glancing at the Dock shows "you have N interviews coming up". */
  private updateDockBadge(): void {
    if (process.platform !== 'darwin') return;
    if (!app.dock) return;
    const count = this.stats?.upcomingInterviews ?? 0;
    app.dock.setBadge(count > 0 ? String(count) : '');
  }

  private openPath(p: string): void {
    if (this.handlers.onOpenPath) {
      this.handlers.onOpenPath(p);
    } else {
      this.handlers.onOpen();
    }
  }

  /** Toggle macOS Dock visibility. When hidden, Heron becomes a
   *  pure menu bar app — close-window doesn't quit, the icon never
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
      const fs = require('node:fs') as typeof import('node:fs');
      const pref = path.join(app.getPath('userData'), 'menubar-only.pref');
      if (enable) fs.writeFileSync(pref, '1');
      else fs.rmSync(pref, { force: true });
    } catch {
      /* non-fatal */
    }
    this.rebuildMenu();
  }

  private runTask(taskId: string): Promise<void> {
    return this.postEmpty('/api/jobs/' + taskId + '/run');
  }

  private toggleAutopilot(): Promise<void> {
    return this.postEmpty('/api/autopilot/toggle').then(() => this.refresh());
  }

  private postEmpty(pathname: string): Promise<void> {
    return new Promise((resolve) => {
      const url = this.handlers.getBackendUrl();
      try {
        const u = new URL(pathname, url);
        const isHttps = u.protocol === 'https:';
        const fn = isHttps ? httpsRequest : httpRequest;
        const req = fn(
          {
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname,
            method: 'POST',
            timeout: 2000,
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve());
          },
        );
        req.on('error', () => resolve());
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.end();
      } catch {
        resolve();
      }
    });
  }
}
