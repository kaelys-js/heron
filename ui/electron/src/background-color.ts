/** Pure helper for resolving the main window's background color from the
 *  Capacitor config. Extracted from setup.ts (which imports electron) so the
 *  logic is unit-testable without the Electron runtime -- same pattern as
 *  dev-server.ts / window-bounds.ts.
 *
 *  The background color paints behind the WebView before its first frame so a
 *  dark-themed app doesn't flash white on launch. It MUST be supplied to the
 *  BrowserWindow constructor: the original code called
 *  webContents.setBackgroundColor(config.electron.backgroundColor) AFTER
 *  construction, but the electron block has no backgroundColor (only the
 *  top-level Capacitor config does), so it passed `undefined` to a native
 *  setter -> "conversion failure from undefined". Because that ran inside
 *  init() before the window-reveal listeners were wired, the window stayed
 *  permanently hidden. The constructor option tolerates undefined; the broken
 *  setter call did not. */

/** Minimal structural shape of the parts of CapacitorElectronConfig we read.
 *  Kept local (no electron import) so this module stays runtime-free. */
export type BackgroundColorConfig = {
  backgroundColor?: string;
  electron?: { backgroundColor?: string };
};

/** The color to paint behind the WebView before first paint. Prefers an
 *  electron-specific override, then the top-level Capacitor value, else
 *  undefined (Electron applies its own default). Never coerces a missing
 *  value into a string that a native setter would reject. */
export function resolveBackgroundColor(config: BackgroundColorConfig): string | undefined {
  return config.electron?.backgroundColor ?? config.backgroundColor;
}
