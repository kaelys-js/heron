import type { ActionReturn } from 'svelte/action';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dragToDismiss,
  type DragToDismissParams,
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

describe('dragToDismiss action', () => {
  // Build a sheet (content node) with the [data-drag-handle] pill inside it.
  function makeSheet() {
    const node = document.createElement('div');
    const handle = document.createElement('div');
    handle.setAttribute('data-drag-handle', '');
    node.appendChild(handle);
    document.body.appendChild(node);
    return { node, handle };
  }
  // jsdom has no PointerEvent; MouseEvent carries clientY/button/preventDefault,
  // and the action only reads `pointerType` extra, which we attach as an own prop.
  // We also PIN a deterministic, monotonically-increasing timeStamp: jsdom
  // otherwise stamps wall-clock time, which makes the action's velocity (dy/dt)
  // nondeterministic -- under load consecutive events are microseconds apart, so
  // a small drag reads as a high-velocity flick and wrongly dismisses. A fixed
  // +1000ms step per event keeps every test drag's velocity far below the flick
  // cut, so dismissal is decided purely by distance (the path under test).
  let stamp = 0;
  function ptr(
    type: string,
    clientY: number,
    opts: { button?: number; pointerType?: string } = {},
  ) {
    const e = new MouseEvent(type, {
      clientY,
      button: opts.button ?? 0,
      bubbles: true,
      cancelable: true,
    });
    Object.assign(e, { pointerType: opts.pointerType ?? 'touch' });
    stamp += 1000;
    Object.defineProperty(e, 'timeStamp', { value: stamp, configurable: true });
    return e;
  }

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.userSelect = '';
    stamp = 0;
  });

  it('binds the grab-handle so the decorative pill becomes draggable', () => {
    const { node, handle } = makeSheet();
    dragToDismiss(node, { onDismiss: () => {} });
    // WHY: without these the pointer gesture never starts (touch scrolls instead)
    // and there's no grab affordance.
    expect(handle.style.touchAction).toBe('none');
    expect(handle.style.cursor).toBe('grab');
  });

  it('snaps back without dismissing when released below the threshold', () => {
    const { node, handle } = makeSheet();
    const onDismiss = vi.fn();
    dragToDismiss(node, { onDismiss });
    handle.dispatchEvent(ptr('pointerdown', 0));
    window.dispatchEvent(ptr('pointermove', 30));
    window.dispatchEvent(ptr('pointerup', 30));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(node.style.transform).toBe(''); // reset to the resting position
  });

  it('commits to dismiss after dragging past the absolute floor', () => {
    const { node, handle } = makeSheet();
    const onDismiss = vi.fn();
    dragToDismiss(node, { onDismiss });
    handle.dispatchEvent(ptr('pointerdown', 0));
    window.dispatchEvent(ptr('pointermove', DRAG_MIN_DISTANCE + 40));
    window.dispatchEvent(ptr('pointerup', DRAG_MIN_DISTANCE + 40));
    // The slide-out animation hasn't finished yet, so onDismiss has not fired.
    expect(onDismiss).not.toHaveBeenCalled();
    node.dispatchEvent(new Event('transitionend'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(node.style.visibility).toBe('hidden'); // hidden before open flips false
  });

  it('still dismisses via the timeout when transitionend never fires', () => {
    vi.useFakeTimers();
    try {
      const { node, handle } = makeSheet();
      const onDismiss = vi.fn();
      dragToDismiss(node, { onDismiss });
      handle.dispatchEvent(ptr('pointerdown', 0));
      window.dispatchEvent(ptr('pointermove', DRAG_MIN_DISTANCE + 40));
      window.dispatchEvent(ptr('pointerup', DRAG_MIN_DISTANCE + 40));
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is inert when enabled is false', () => {
    const { node, handle } = makeSheet();
    const onDismiss = vi.fn();
    dragToDismiss(node, { onDismiss, enabled: false });
    handle.dispatchEvent(ptr('pointerdown', 0));
    window.dispatchEvent(ptr('pointermove', 300));
    window.dispatchEvent(ptr('pointerup', 300));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(node.style.transform).toBe('');
  });

  it('ignores non-primary mouse buttons (right-click must not start a drag)', () => {
    const { node, handle } = makeSheet();
    const onDismiss = vi.fn();
    dragToDismiss(node, { onDismiss });
    handle.dispatchEvent(ptr('pointerdown', 0, { pointerType: 'mouse', button: 2 }));
    window.dispatchEvent(ptr('pointermove', 300));
    window.dispatchEvent(ptr('pointerup', 300));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('restores body user-select and detaches listeners on destroy', () => {
    const { node, handle } = makeSheet();
    // The Svelte Action type is `() => void | ActionReturn`; cast to the object
    // form to reach update()/destroy() (the implementation always returns it).
    const action = dragToDismiss(node, {
      onDismiss: () => {},
    }) as ActionReturn<DragToDismissParams>;
    handle.dispatchEvent(ptr('pointerdown', 0));
    expect(document.body.style.userSelect).toBe('none'); // suppressed mid-drag
    action.destroy?.();
    expect(document.body.style.userSelect).toBe(''); // restored
    // A stray move after destroy must be a no-op (listeners gone).
    window.dispatchEvent(ptr('pointermove', 300));
    expect(node.style.transform).toBe('');
  });

  it('update() swaps in the new onDismiss callback', () => {
    const { node, handle } = makeSheet();
    const first = vi.fn();
    const second = vi.fn();
    const action = dragToDismiss(node, {
      onDismiss: first,
    }) as ActionReturn<DragToDismissParams>;
    action.update?.({ onDismiss: second });
    handle.dispatchEvent(ptr('pointerdown', 0));
    window.dispatchEvent(ptr('pointermove', DRAG_MIN_DISTANCE + 40));
    window.dispatchEvent(ptr('pointerup', DRAG_MIN_DISTANCE + 40));
    node.dispatchEvent(new Event('transitionend'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
