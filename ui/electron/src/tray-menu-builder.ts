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
  /** Show the window if hidden, hide it if visible. */
  onToggleWindow: () => void;
  /** Toggle macOS Menu-Bar-Only mode (hide/show the Dock icon). */
  onToggleMenuBarOnly: () => void;
  /** Quit the app. */
  onQuit: () => void;
};

export type MenuBuilderContext = {
  platform: NodeJS.Platform;
  menuBarOnly: boolean;
  /** Whether any app window is currently visible (drives the Show/Hide label). */
  windowVisible: boolean;
  appVersion: string;
  displayName: string;
};

/**
 * Build the tray context-menu template. Deliberately minimal -- a menu-bar
 * utility, not a second navigation surface:
 *
 *   1. macOS-only: "Hide Dock Icon" checkbox (run as a pure menu-bar app)
 *   2. "Show Window" / "Hide Window" (label tracks the live window state)
 *   3. Version (disabled label)
 *   4. "Quit <brand>"
 */
export function buildTrayMenuTemplate(
  ctx: MenuBuilderContext,
  handlers: MenuBuilderHandlers,
): MenuItemConstructorOptions[] {
  const { platform, menuBarOnly, windowVisible, appVersion, displayName } = ctx;
  const items: MenuItemConstructorOptions[] = [];

  // 1. macOS Dock-icon toggle. Checked = no Dock icon (pure menu-bar app).
  if (platform === 'darwin') {
    items.push({
      label: 'Hide Dock Icon',
      type: 'checkbox',
      checked: menuBarOnly,
      click: () => handlers.onToggleMenuBarOnly(),
    });
    items.push({ type: 'separator' });
  }

  // 2. Window toggle -- label reflects the current visibility.
  items.push({
    label: windowVisible ? 'Hide Window' : 'Show Window',
    click: () => handlers.onToggleWindow(),
  });
  items.push({ type: 'separator' });

  // 3 + 4. Version + Quit.
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
  if (platform !== 'darwin') {
    return '';
  }
  if (stats && stats.queued > 0) {
    return String(stats.queued);
  }
  return '';
}

/**
 * Compute the macOS Dock badge text. Empty clears the badge; we use it
 * as a "you have N interviews coming up" indicator.
 */
export function computeDockBadge(stats: Stats | null, platform: NodeJS.Platform): string {
  if (platform !== 'darwin') {
    return '';
  }
  const count = stats?.upcomingInterviews ?? 0;
  return count > 0 ? String(count) : '';
}
