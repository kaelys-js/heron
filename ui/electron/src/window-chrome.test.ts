/** window-chrome -- per-OS modern-chrome window options.
 *
 * WHY these assertions matter: the renderer's drag-strip / traffic-light
 * clearance CSS is hand-aligned to these exact native values. If the title-bar
 * style, traffic-light inset, or the transparent-background flag drift here
 * without the CSS following, the window controls land OUTSIDE the drag strip
 * (un-grabbable / overlapping app UI) or the vibrancy/mica material stops
 * showing (opaque window). So we pin the contract, not just "some object".
 */
import { describe, it, expect } from 'vitest';
import { buildWindowChrome, DRAG_STRIP_HEIGHT } from './window-chrome';

describe('buildWindowChrome', () => {
  it('macOS: hiddenInset + traffic lights centred in the drag strip + sidebar vibrancy', () => {
    const c = buildWindowChrome('darwin');
    expect(c.titleBarStyle).toBe('hiddenInset');
    expect(c.vibrancy).toBe('sidebar');
    expect(c.transparentBackground).toBe(true);
    // Lights vertically centred in the 44px strip (a ~14px control).
    expect(c.trafficLightPosition).toEqual({ x: 16, y: Math.round((DRAG_STRIP_HEIGHT - 14) / 2) });
    // No Windows-only material on mac.
    expect(c.backgroundMaterial).toBeUndefined();
  });

  it('Windows: Win11 mica material + transparent background, no mac title-bar bits', () => {
    const c = buildWindowChrome('win32');
    expect(c.backgroundMaterial).toBe('mica');
    expect(c.transparentBackground).toBe(true);
    expect(c.titleBarStyle).toBeUndefined();
    expect(c.vibrancy).toBeUndefined();
    expect(c.trafficLightPosition).toBeUndefined();
  });

  it('Linux/other: standard framed window, opaque background (no material)', () => {
    const c = buildWindowChrome('linux');
    expect(c.transparentBackground).toBe(false);
    expect(c.titleBarStyle).toBeUndefined();
    expect(c.vibrancy).toBeUndefined();
    expect(c.backgroundMaterial).toBeUndefined();
  });
});
