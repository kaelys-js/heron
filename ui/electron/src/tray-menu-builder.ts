/** Tray menu template builder -- pure function that turns the current
 *  stats + platform state into a Electron MenuItemConstructorOptions[].
 *  Extracted from tray.ts so the menu structure is unit-testable without
 *  spinning up a real Tray.
 *
 *  Click handlers are passed in via the BuilderHandlers param. The tray
 *  controller wires them to its private methods (openPath, runTask,
 *  toggleAutopilot, setMenuBarOnly, etc.). */
import type { MenuItemConstructorOptions } from 'electron';
import type { Stats } from './tray-http';

export type MenuBuilderHandlers = {
  /** Open a dashboard path (e.g. /pipeline, /inbox). */
  onOpenPath: (p: string) => void;
  /** Bring the main window forward and show it. */
  onShowDashboard: () => void;
  /** Hide all windows. */
  onHideWindow: () => void;
  /** Trigger a backend task (e.g. scan-portals). */
  onRunTask: (taskId: string) => void;
  /** Toggle the autopilot pause state. */
  onToggleAutopilot: () => void;
  /** Toggle macOS Menu-Bar-Only mode. */
  onToggleMenuBarOnly: () => void;
  /** Quit the app. */
  onQuit: () => void;
};

export type MenuBuilderContext = {
  stats: Stats | null;
  platform: NodeJS.Platform;
  menuBarOnly: boolean;
  appVersion: string;
  displayName: string;
};

/**
 * Build the tray context-menu template.
 *
 * Layout (top -> bottom):
 *   1. Stats line (or "(backend offline)") + optional open-issues row
 *   2. Section quick-jumps: Pipeline / Inbox / Queue / Stats
 *   3. Actions: Scan now / [Pause|Resume] autopilot
 *   4. macOS-only: Menu Bar Only toggle
 *   5. Window controls: Show dashboard / Hide window
 *   6. Footer: Version label / Quit
 */
export function buildTrayMenuTemplate(
  ctx: MenuBuilderContext,
  handlers: MenuBuilderHandlers,
): MenuItemConstructorOptions[] {
  const { stats, platform, menuBarOnly, appVersion, displayName } = ctx;
  const items: MenuItemConstructorOptions[] = [];

  // 1. Stats header
  if (stats) {
    items.push({
      label: `Today: ${stats.queued} queued · ${stats.appliedToday} applied · ${stats.upcomingInterviews} interviews`,
      enabled: false,
    });
    if ((stats.openIssues ?? 0) > 0) {
      items.push({
        label: `⚠ ${stats.openIssues} open issue${stats.openIssues === 1 ? '' : 's'}`,
        click: () => handlers.onOpenPath('/inbox'),
      });
    }
  } else {
    items.push({ label: '(backend offline)', enabled: false });
  }
  items.push({ type: 'separator' });

  // 2. Section quick-jumps
  items.push({
    label: 'Pipeline',
    accelerator: 'CmdOrCtrl+P',
    click: () => handlers.onOpenPath('/pipeline'),
  });
  items.push({
    label: 'Inbox',
    accelerator: 'CmdOrCtrl+I',
    click: () => handlers.onOpenPath('/inbox'),
  });
  items.push({
    label: 'Queue',
    click: () => handlers.onOpenPath('/queue'),
  });
  items.push({
    label: 'Stats',
    click: () => handlers.onOpenPath('/stats'),
  });
  items.push({ type: 'separator' });

  // 3. Actions
  items.push({
    label: 'Scan now',
    click: () => handlers.onRunTask('scan-portals'),
  });
  if (stats) {
    items.push({
      label: stats.autopilotPaused ? 'Resume autopilot' : 'Pause autopilot',
      click: () => handlers.onToggleAutopilot(),
    });
  }
  items.push({ type: 'separator' });

  // 4. macOS Menu Bar Only toggle
  if (platform === 'darwin') {
    items.push({
      label: 'Menu Bar Only (hide Dock icon)',
      type: 'checkbox',
      checked: menuBarOnly,
      click: () => handlers.onToggleMenuBarOnly(),
    });
    items.push({ type: 'separator' });
  }

  // 5. Window controls
  items.push({
    label: 'Show dashboard',
    accelerator: 'CmdOrCtrl+0',
    click: () => handlers.onShowDashboard(),
  });
  items.push({
    label: 'Hide window',
    accelerator: 'CmdOrCtrl+H',
    click: () => handlers.onHideWindow(),
  });
  items.push({ type: 'separator' });

  // 6. Footer
  items.push({ label: `Version ${appVersion}`, enabled: false });
  items.push({
    label: `Quit ${displayName}`,
    accelerator: 'CmdOrCtrl+Q',
    click: () => handlers.onQuit(),
  });

  return items;
}

/**
 * Compute the macOS tray title (the text shown next to the menubar
 * icon). Empty string clears the title; we use it as an "unread"
 * counter that mirrors `stats.queued`.
 */
export function computeTrayTitle(stats: Stats | null, platform: NodeJS.Platform): string {
  if (platform !== 'darwin') return '';
  if (stats && stats.queued > 0) return String(stats.queued);
  return '';
}

/**
 * Compute the macOS Dock badge text. Empty clears the badge; we use it
 * as a "you have N interviews coming up" indicator.
 */
export function computeDockBadge(stats: Stats | null, platform: NodeJS.Platform): string {
  if (platform !== 'darwin') return '';
  const count = stats?.upcomingInterviews ?? 0;
  return count > 0 ? String(count) : '';
}
