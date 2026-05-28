/** Pure helpers for restoring the main window's saved bounds safely.
 *  Extracted from setup.ts (which imports electron) so the off-screen
 *  logic is unit-testable without a real `screen` module (cf dev-server.ts).
 *
 *  electron-window-state persists the window x/y across launches. If the
 *  window was last on an external display that's now gone (laptop
 *  undocked, monitor asleep), the restored x/y covers no current display
 *  and the window opens fully off-screen -- present but invisible. That's
 *  the "dev:desktop shows no window after I came back" report; we drop the
 *  saved position when it isn't visible so the window centers instead. */

export type Rect = { x: number; y: number; width: number; height: number };

/** A restored window state: width/height are always known (defaults
 *  applied by windowStateKeeper); x/y may be undefined on first launch. */
export type SavedBounds = { x?: number; y?: number; width: number; height: number };

/** Area (px) where two rectangles overlap. 0 when they don't touch. */
function overlapArea(a: Rect, b: Rect): { w: number; h: number } {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return { w, h };
}

/** Whether enough of the window sits on some display for the user to see
 *  and grab it. `minVisible` is the px of title-bar that must land inside
 *  a display's work area on BOTH axes (default 48 -- a grabbable strip). */
export function isWindowVisible(
  bounds: SavedBounds,
  displayWorkAreas: Rect[],
  minVisible = 48,
): boolean {
  if (bounds.x === undefined || bounds.y === undefined) {
    return false;
  }
  if (displayWorkAreas.length === 0) {
    return false;
  }
  const win: Rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  return displayWorkAreas.some((area) => {
    const { w, h } = overlapArea(win, area);
    return w >= minVisible && h >= minVisible;
  });
}

/** Return bounds safe to open the window with. If the saved position is
 *  off every display, drop x/y so the caller centers the window on the
 *  primary display instead of opening it off-screen. Size is preserved. */
export function clampWindowBounds(bounds: SavedBounds, displayWorkAreas: Rect[]): SavedBounds {
  if (isWindowVisible(bounds, displayWorkAreas)) {
    return bounds;
  }
  return { width: bounds.width, height: bounds.height };
}
