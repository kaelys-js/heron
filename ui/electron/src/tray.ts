/**
 * System tray with live quick-glance.
 *
 * Renders a tray icon in macOS top-right / Windows bottom-right /
 * Linux as supported. Clicking the icon opens a popover with:
 *
 *   • "Today: 3 queued · 1 applied · 2 interviews"
 *   • Open Dashboard
 *   • Pause / Resume Autopilot
 *   • Quit career-ops
 *
 * Polls /api/stats every 30s for the labels. If the backend isn't
 * reachable the menu shows "(backend offline)" instead of stale numbers.
 */
import { Tray, Menu, MenuItemConstructorOptions, nativeImage, app } from 'electron';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export type TrayHandlers = {
  getBackendUrl: () => string;
  onOpen: () => void;
  onQuit: () => void;
};

type Stats = {
  queued: number;
  appliedToday: number;
  upcomingInterviews: number;
  autopilotPaused?: boolean;
};

const POLL_INTERVAL_MS = 30_000;

export class CareerOpsTray {
  private tray?: Tray;
  private timer?: NodeJS.Timeout;
  private stats: Stats | null = null;
  private handlers: TrayHandlers;

  constructor(handlers: TrayHandlers) {
    this.handlers = handlers;
  }

  start(): void {
    // Tray icon — uses the .png shipped in electron/build/icon.png.
    // On macOS, prefer a template image (monochrome) so it adapts to
    // light/dark menu bar; users can override by shipping iconTemplate.png.
    const iconPath = path.resolve(__dirname, '..', '..', 'build', 'icon.png');
    const img = nativeImage.createFromPath(iconPath);
    // Resize to 22px (Mac standard) — required because the source PNG is 512.
    const resized = img.resize({ width: 22, height: 22 });
    if (process.platform === 'darwin') resized.setTemplateImage(true);
    this.tray = new Tray(resized);
    this.tray.setToolTip('career-ops');

    this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.tray?.destroy();
    this.tray = undefined;
  }

  /** Fetch /api/stats and rebuild the popover menu. */
  private async refresh(): Promise<void> {
    const url = this.handlers.getBackendUrl();
    this.stats = await this.fetchStats(url).catch(() => null);
    this.rebuildMenu();
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
            method: 'GET',
            timeout: 1500,
          },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              if ((res.statusCode ?? 0) < 200 || res.statusCode! >= 300) {
                resolve(null);
                return;
              }
              try {
                const json = JSON.parse(body);
                resolve({
                  queued: Number(json.queued ?? 0),
                  appliedToday: Number(json.appliedToday ?? 0),
                  upcomingInterviews: Number(json.upcomingInterviews ?? 0),
                  autopilotPaused: Boolean(json.autopilotPaused),
                });
              } catch {
                resolve(null);
              }
            });
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
    } else {
      items.push({ label: '(backend offline)', enabled: false });
    }
    items.push({ type: 'separator' });
    items.push({ label: 'Open Dashboard', click: () => this.handlers.onOpen() });
    if (this.stats) {
      items.push({
        label: this.stats.autopilotPaused ? 'Resume autopilot' : 'Pause autopilot',
        click: () => void this.toggleAutopilot(),
      });
    }
    items.push({ type: 'separator' });
    items.push({ label: `Version ${app.getVersion()}`, enabled: false });
    items.push({ label: 'Quit career-ops', click: () => this.handlers.onQuit() });

    const contextMenu = Menu.buildFromTemplate(items);
    this.tray.setContextMenu(contextMenu);
    // macOS: also update the title with the queued count badge.
    if (process.platform === 'darwin' && this.stats && this.stats.queued > 0) {
      this.tray.setTitle(String(this.stats.queued));
    } else if (process.platform === 'darwin') {
      this.tray.setTitle('');
    }
  }

  private toggleAutopilot(): Promise<void> {
    return new Promise((resolve) => {
      const url = this.handlers.getBackendUrl();
      try {
        const u = new URL('/api/autopilot/toggle', url);
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
            res.on('end', () => {
              void this.refresh();
              resolve();
            });
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
