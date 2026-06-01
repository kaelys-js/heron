import { describe, expect, it } from 'vitest';
import {
  shouldDismiss,
  DRAG_MIN_DISTANCE,
  DRAG_HEIGHT_FRACTION,
  DRAG_FLICK_VELOCITY,
} from './drag-to-dismiss';

describe('shouldDismiss', () => {
  const TALL = 800; // 25% = 200px threshold
  const SHORT = 200; // 25% = 50px < floor → 88px threshold

  it('dismisses when dragged past the height-fraction threshold', () => {
    const threshold = TALL * DRAG_HEIGHT_FRACTION;
    expect(shouldDismiss({ dy: threshold + 1, velocity: 0, height: TALL })).toBe(true);
    expect(shouldDismiss({ dy: threshold - 1, velocity: 0, height: TALL })).toBe(false);
  });

  it('uses the absolute floor for short sheets so they still close', () => {
    // 25% of a short sheet (50px) is below the floor, so the floor wins.
    expect(DRAG_MIN_DISTANCE).toBeGreaterThan(SHORT * DRAG_HEIGHT_FRACTION);
    expect(shouldDismiss({ dy: DRAG_MIN_DISTANCE + 1, velocity: 0, height: SHORT })).toBe(true);
    expect(shouldDismiss({ dy: DRAG_MIN_DISTANCE - 1, velocity: 0, height: SHORT })).toBe(false);
  });

  it('dismisses on a fast downward flick even when the drag is short', () => {
    // dy well under threshold, but velocity over the flick cut → still closes.
    expect(shouldDismiss({ dy: 10, velocity: DRAG_FLICK_VELOCITY + 0.1, height: TALL })).toBe(true);
    expect(shouldDismiss({ dy: 10, velocity: DRAG_FLICK_VELOCITY - 0.1, height: TALL })).toBe(
      false,
    );
  });

  it('does not dismiss on an idle release near the top', () => {
    expect(shouldDismiss({ dy: 0, velocity: 0, height: TALL })).toBe(false);
  });
});
