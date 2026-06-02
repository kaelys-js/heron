/**
 * `dragToDismiss` -- drag-to-close gesture for a bottom sheet.
 *
 * bits-ui's Sheet (a Dialog under the hood) dismisses via overlay-tap + Escape
 * but has NO drag affordance, so the grab-handle pill on our bottom sheets was
 * purely decorative. This action makes it real: pointer-drag DOWN on an element
 * marked `[data-drag-handle]` translates the sheet with your finger and, past a
 * threshold (or on a fast downward flick), animates it the rest of the way out
 * and calls `onDismiss` (the consumer flips `open = false`). Below the
 * threshold it snaps back.
 *
 * Attach to the sheet CONTENT element; the handle lives inside it:
 *   <Sheet.Content use:dragToDismiss={{ onDismiss: () => (open = false) }}>
 *     <div data-drag-handle ...></div>
 *     ...
 *   </Sheet.Content>
 *
 * The dismiss DECISION is a pure function (`shouldDismiss`) so it can be unit
 * tested without a DOM / pointer-capture / layout dependency.
 */
import type { Action } from 'svelte/action';

export type DragToDismissParams = {
  /** Called once the gesture commits to closing. Consumer flips its open state. */
  onDismiss: () => void;
  /** When false the gesture is inert (e.g. the desktop dropdown path). */
  enabled?: boolean;
};

/** Min absolute drag distance (px) that commits to a dismiss regardless of sheet
 *  size -- so small sheets still close with a deliberate pull. */
export const DRAG_MIN_DISTANCE = 88;
/** …or this fraction of the sheet's own height, whichever is larger. */
export const DRAG_HEIGHT_FRACTION = 0.25;
/** A downward flick faster than this (px/ms) dismisses even on a short drag. */
export const DRAG_FLICK_VELOCITY = 0.6;

/** Pure dismiss decision: dragged far enough, OR flicked down fast enough. */
export function shouldDismiss(opts: { dy: number; velocity: number; height: number }): boolean {
  const threshold = Math.max(DRAG_MIN_DISTANCE, opts.height * DRAG_HEIGHT_FRACTION);
  return opts.dy > threshold || opts.velocity > DRAG_FLICK_VELOCITY;
}

export const dragToDismiss: Action<HTMLElement, DragToDismissParams> = (node, params) => {
  let current = params;
  let handle: HTMLElement | null = null;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let prevBodyUserSelect = '';

  const clearInline = (): void => {
    node.style.transition = '';
    node.style.transform = '';
    node.style.visibility = '';
  };

  const restoreSelection = (): void => {
    document.body.style.userSelect = prevBodyUserSelect;
  };

  const onMove = (e: PointerEvent): void => {
    const dy = Math.max(0, e.clientY - startY);
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    node.style.transition = 'none';
    node.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    // Once the user is clearly dragging down, claim the gesture so the sheet's
    // scroll container doesn't also scroll.
    if (dy > 0) e.preventDefault();
  };

  const onUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    restoreSelection();
    if (!dragging) return;
    dragging = false;

    const dy = Math.max(0, e.clientY - startY);
    if (shouldDismiss({ dy, velocity, height: node.offsetHeight })) {
      // Continue the motion: slide the sheet the rest of the way off-screen,
      // then dismiss. We do NOT reset the transform first -- the library's own
      // exit animation restarts from translateY(0), so once the slide finishes
      // we HIDE the panel before flipping open=false. That exit then plays
      // invisibly (the backdrop still fades) and unmounts cleanly -- no snap
      // back up to the resting position.
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        node.removeEventListener('transitionend', finish);
        node.style.visibility = 'hidden';
        current.onDismiss();
      };
      node.style.transition = 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)';
      node.style.transform = `translateY(${node.offsetHeight || dy}px)`;
      node.addEventListener('transitionend', finish);
      // Fallback if transitionend never fires (e.g. offsetHeight ≈ dy → no move).
      const timer = window.setTimeout(finish, 280);
    } else {
      node.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
      node.style.transform = '';
    }
  };

  const onDown = (e: PointerEvent): void => {
    if (current.enabled === false) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Stop the press from starting a text selection / focus drag on the sheet.
    e.preventDefault();
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    prevBodyUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const bindHandle = (): void => {
    handle = node.querySelector<HTMLElement>('[data-drag-handle]');
    if (!handle) return;
    handle.style.touchAction = 'none';
    handle.style.userSelect = 'none';
    handle.style.cursor = 'grab';
    handle.addEventListener('pointerdown', onDown);
  };

  const unbindHandle = (): void => {
    handle?.removeEventListener('pointerdown', onDown);
    handle = null;
  };

  bindHandle();

  return {
    update(next: DragToDismissParams) {
      current = next;
    },
    destroy() {
      unbindHandle();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      restoreSelection();
      clearInline();
    },
  };
};
