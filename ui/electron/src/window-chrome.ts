/** Pure, per-OS "modern chrome" window options. Isolated from setup.ts (which
 *  imports electron + constructs a real BrowserWindow) so the platform branching
 *  is unit-testable on its own.
 *
 *  macOS  → `hiddenInset` title bar (the traffic lights float over the web
 *           content; no native title bar strip), the lights nudged down to sit
 *           centred in the app's own top drag strip, and a 'sidebar' vibrancy
 *           material behind the (translucent) sidebar.
 *  win32  → Win11 'mica' background material. Shows behind translucent surfaces;
 *           silently ignored on Win10 / unsupported builds (no error).
 *  else   → standard framed window, opaque background (no special chrome).
 *
 *  `transparentBackground` tells the caller to construct the window with a fully
 *  transparent backgroundColor so the OS material (vibrancy / mica) shows through
 *  wherever the renderer paints nothing. On those platforms the material itself
 *  is what's visible during the pre-paint window (a soft frosted blur), so it
 *  REPLACES the old opaque-splashBg anti-flash trick rather than fighting it. */
import type { BrowserWindowConstructorOptions } from 'electron';

export type WindowChrome = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'trafficLightPosition' | 'vibrancy' | 'backgroundMaterial'
> & { transparentBackground: boolean };

/** Height (px) of the app's top drag strip; the traffic lights are vertically
 *  centred within it (a ~14px tall control → (DRAG_STRIP - 14) / 2 top inset).
 *  The renderer reserves the same strip via CSS (`--electron-drag-strip`). */
export const DRAG_STRIP_HEIGHT = 44;

export function buildWindowChrome(platform: NodeJS.Platform): WindowChrome {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: Math.round((DRAG_STRIP_HEIGHT - 14) / 2) },
      vibrancy: 'sidebar',
      transparentBackground: true,
    };
  }
  if (platform === 'win32') {
    return {
      backgroundMaterial: 'mica',
      transparentBackground: true,
    };
  }
  return { transparentBackground: false };
}
