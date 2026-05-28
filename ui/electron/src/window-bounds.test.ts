import { describe, it, expect } from 'vitest';
import { isWindowVisible, clampWindowBounds, type Rect } from './window-bounds';

// A single 1440x900 laptop display at the origin (work area below the menu bar).
const LAPTOP: Rect[] = [{ x: 0, y: 25, width: 1440, height: 875 }];
// Laptop + an external 1920x1080 display to its right (x >= 1440).
const DUAL: Rect[] = [...LAPTOP, { x: 1440, y: 0, width: 1920, height: 1080 }];

describe('isWindowVisible', () => {
  it('false when no x/y is saved (first launch)', () => {
    expect(isWindowVisible({ width: 1000, height: 800 }, LAPTOP)).toBe(false);
  });
  it('false when no displays are connected', () => {
    expect(isWindowVisible({ x: 100, y: 100, width: 1000, height: 800 }, [])).toBe(false);
  });
  it('true when the window sits on the laptop display', () => {
    expect(isWindowVisible({ x: 100, y: 100, width: 1000, height: 800 }, LAPTOP)).toBe(true);
  });
  it('false when the window is on a now-disconnected external display', () => {
    // Saved on the external monitor (x=2000); only the laptop is connected now.
    expect(isWindowVisible({ x: 2000, y: 300, width: 1000, height: 800 }, LAPTOP)).toBe(false);
  });
  it('true when that same external position is still connected', () => {
    expect(isWindowVisible({ x: 2000, y: 300, width: 1000, height: 800 }, DUAL)).toBe(true);
  });
  it('false when only a sliver smaller than minVisible overlaps', () => {
    // Window pushed left so only 20px of its right edge is on-screen.
    expect(isWindowVisible({ x: -980, y: 100, width: 1000, height: 800 }, LAPTOP)).toBe(false);
  });
});

describe('clampWindowBounds', () => {
  it('keeps visible bounds untouched', () => {
    const b = { x: 100, y: 100, width: 1000, height: 800 };
    expect(clampWindowBounds(b, LAPTOP)).toEqual(b);
  });
  it('drops x/y (centers) when the saved position is off every display', () => {
    expect(clampWindowBounds({ x: 2000, y: 300, width: 1000, height: 800 }, LAPTOP)).toEqual({
      width: 1000,
      height: 800,
    });
  });
  it('passes through first-launch bounds (no x/y) unchanged', () => {
    expect(clampWindowBounds({ width: 1000, height: 800 }, LAPTOP)).toEqual({
      width: 1000,
      height: 800,
    });
  });
});
